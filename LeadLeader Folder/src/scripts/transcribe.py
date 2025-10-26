#!/usr/bin/env python3
"""
Whisper transcription using faster-whisper.
Reads audio file, outputs JSON with transcript and segments.
"""
import argparse
import json
import sys
from faster_whisper import WhisperModel

def transcribe_audio(audio_path, model_name="base.en"):
    """
    Transcribe audio using faster-whisper.
    Returns dict with text, segments, and duration.
    """
    try:
        # Load model (cached after first run)
        model = WhisperModel(
            model_name,
            device="cpu",
            compute_type="int8"
        )
        
        # Transcribe with VAD filter
        segments, info = model.transcribe(
            audio_path,
            beam_size=5,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500)
        )
        
        # Collect segments
        segment_list = []
        full_text = ""
        
        for segment in segments:
            segment_list.append({
                "start": round(segment.start, 2),
                "end": round(segment.end, 2),
                "text": segment.text.strip()
            })
            full_text += segment.text + " "
        
        result = {
            "text": full_text.strip(),
            "segments": segment_list,
            "duration_sec": round(info.duration, 2),
            "language": info.language,
            "language_probability": round(info.language_probability, 2)
        }
        
        return result
        
    except Exception as e:
        return {
            "error": str(e),
            "text": "",
            "segments": [],
            "duration_sec": 0
        }

def main():
    parser = argparse.ArgumentParser(description="Transcribe audio with Whisper")
    parser.add_argument("--audio", required=True, help="Path to audio file")
    parser.add_argument("--model", default="base.en", help="Whisper model (default: base.en)")
    
    args = parser.parse_args()
    
    result = transcribe_audio(args.audio, args.model)
    
    # Output JSON to stdout
    print(json.dumps(result))
    
    # Exit with error code if transcription failed
    if "error" in result and result["error"]:
        sys.exit(1)
    
    sys.exit(0)

if __name__ == "__main__":
    main()
