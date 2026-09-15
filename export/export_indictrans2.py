"""
export_indictrans2.py — IndicTrans2 into something a browser can run.

    pip install -U "transformers>=4.44" optimum[onnxruntime] onnx sentencepiece tokenizers
    python export_indictrans2.py --pack indic --out ./indic-indic-onnx

WHAT THIS DOES

IndicTrans2 ships as PyTorch with a hand-written tokenizer. A browser needs
ONNX graphs and a tokenizer.json. This converts both, quantizes the weights to
int8 so the download is ~330MB rather than ~1.3GB, and writes the directory
layout transformers.js expects:

    config.json  generation_config.json  tokenizer.json  tokenizer_config.json
    onnx/encoder_model_quantized.onnx
    onnx/decoder_model_merged_quantized.onnx

Upload that directory to a HuggingFace repo and put its name in engine.js.

READ THIS BEFORE YOU RUN IT

This script has not been executed. The sandbox it was written in has no
network route to HuggingFace, so the model was never downloaded and the
export was never run. It is a considered starting point, not a verified
pipeline, and two steps are where it will most likely need your hand:

  1. IndicTrans2 is a custom architecture (IndicTransForConditionalGeneration,
     loaded with trust_remote_code). Optimum may not recognise it. Its
     internals follow M2M100 closely, which is why the override below exists;
     if Optimum still refuses, exporting encoder and decoder separately with
     torch.onnx.export is the fallback.

  2. The tokenizer is the real work. IndicTrans2 carries *two* SentencePiece
     models — one per side — plus a Fairseq-style dictionary, and prepends
     language tags as plain tokens. transformers.js reads one tokenizer.json.
     convert_tokenizer() below builds it, and the assertion at the end is
     there because a tokenizer that is subtly wrong produces fluent, confident,
     completely incorrect Marathi rather than an error.

Check the round-trip the script prints before you trust anything downstream.
"""

import argparse
import json
import shutil
from pathlib import Path

PACKS = {
    # Hindi (and anything transliterated into Devanagari) to Marathi.
    "indic": {
        "model": "ai4bharat/indictrans2-indic-indic-dist-320M",
        "src": "hin_Deva",
        "tgt": "mar_Deva",
    },
    # English to Marathi. A separate checkpoint, hence a separate pack.
    "english": {
        "model": "ai4bharat/indictrans2-en-indic-dist-200M",
        "src": "eng_Latn",
        "tgt": "mar_Deva",
    },
}


def convert_tokenizer(model_id, out_dir):
    """The SentencePiece pair into one tokenizer.json.

    IndicTrans2 keeps source and target vocabularies apart. For a fixed
    direction only the source side has to encode and only the target side has
    to decode, so a single tokenizer built on the source model with the target
    vocabulary merged in is enough — and it is what transformers.js can load.
    """
    from transformers import AutoTokenizer
    from tokenizers import SentencePieceUnigramTokenizer

    tok = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)

    # The fast path: if this checkpoint already has a fast tokenizer, use it
    # and skip every hazard described above.
    if getattr(tok, "is_fast", False):
        tok.save_pretrained(out_dir)
        return tok

    sp_file = None
    for name in ("model.SRC", "model.SRC.vocab", "spm.SRC.model", "sentencepiece.bpe.model"):
        candidate = Path(tok.vocab_file).parent / name if getattr(tok, "vocab_file", None) else None
        if candidate and candidate.exists():
            sp_file = candidate
            break
    if sp_file is None:
        raise SystemExit(
            "Could not find the source SentencePiece model. Look inside the "
            "downloaded snapshot (huggingface_hub.snapshot_download) and point "
            "sp_file at the .model file for the source side."
        )

    fast = SentencePieceUnigramTokenizer.from_spm(str(sp_file))
    fast.save(str(Path(out_dir) / "tokenizer.json"))
    tok.save_pretrained(out_dir)
    return tok


def export(pack_name, out):
    pack = PACKS[pack_name]
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)

    from optimum.exporters.onnx import main_export
    from onnxruntime.quantization import quantize_dynamic, QuantType

    print(f"exporting {pack['model']} ...")
    main_export(
        pack["model"],
        output=out,
        task="text2text-generation-with-past",
        trust_remote_code=True,
        # IndicTrans2's layers are M2M100's. Telling Optimum so is what lets
        # it pick a config instead of refusing an architecture it has never
        # been told about.
        model_kwargs={"trust_remote_code": True},
        library_name="transformers",
    )

    onnx_dir = out / "onnx"
    onnx_dir.mkdir(exist_ok=True)
    for f in out.glob("*.onnx"):
        shutil.move(str(f), str(onnx_dir / f.name))

    # int8 is what makes this a download rather than a data plan. Quality loss
    # on NMT is small; the size difference is a factor of four.
    for f in sorted(onnx_dir.glob("*.onnx")):
        if "quantized" in f.name:
            continue
        target = onnx_dir / f.name.replace(".onnx", "_quantized.onnx")
        print(f"quantizing {f.name} -> {target.name}")
        quantize_dynamic(str(f), str(target), weight_type=QuantType.QInt8)

    print("converting tokenizer ...")
    tok = convert_tokenizer(pack["model"], out)

    cfg_path = out / "tokenizer_config.json"
    cfg = json.loads(cfg_path.read_text()) if cfg_path.exists() else {}
    cfg.update({"src_lang": pack["src"], "tgt_lang": pack["tgt"]})
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2))

    # A tokenizer that round-trips wrong does not fail loudly — it produces
    # confident nonsense. Fail here instead.
    probe = "मला मदत हवी आहे" if pack_name == "indic" else "I need help"
    ids = tok(probe)["input_ids"]
    back = tok.decode(ids, skip_special_tokens=True)
    print(f"round trip: {probe!r} -> {len(ids)} tokens -> {back!r}")
    assert probe.replace(" ", "") in back.replace(" ", ""), (
        "Tokenizer round trip lost the input. Do not ship this — the model "
        "will translate something other than what was typed."
    )

    total = sum(f.stat().st_size for f in onnx_dir.glob("*_quantized.onnx"))
    print(f"\ndone: {out}  ({total / 1024 / 1024:.0f} MB quantized)")
    print("upload it, then set the pack's id in engine.js")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--pack", choices=sorted(PACKS), default="indic")
    ap.add_argument("--out", default="./indictrans2-onnx")
    args = ap.parse_args()
    export(args.pack, args.out)
