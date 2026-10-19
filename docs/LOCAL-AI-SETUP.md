# Local AI Setup — Ollama + Qwen3 + Falcon-H1 Arabic

## Overview

The Trustee Operations Portal uses a fully local AI stack. No cloud APIs. No per-token costs. All inference stays on your machine — PDPL-compliant by construction.

## Prerequisites

### Hardware

| Deployment | RAM | GPU | Speed |
|---|---|---|---|
| Dev (single user) | 32GB | None (CPU) | 5-10× slower |
| Dev (recommended) | 64GB | RTX 4090 (24GB VRAM) | Fast |
| Production pilot | 128GB | 2× A6000 (48GB each) | Fast |

### Software

```bash
# 1. Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 2. Pull the primary model (Qwen 3 MoE, ~18.5GB)
ollama pull qwen3:30b-a3b

# 3. Register the Arabic model (Falcon-H1R, not in Ollama registry)
# Download GGUF from HuggingFace:
wget https://huggingface.co/tiiuae/Falcon-H1R-7B-GGUF/resolve/main/falcon-h1-7b-Q4_K_M.gguf

# Create Modelfile:
cat > Modelfile.falcon-h1 <<'EOF'
FROM ./falcon-h1-7b-Q4_K_M.gguf
TEMPLATE "{{ .Prompt }}"
PARAMETER temperature 0.1
PARAMETER stop "<|im_end|>"
EOF

# Register with Ollama:
ollama create falcon-h1-arabic:7b -f Modelfile.falcon-h1

# 4. Verify
npx tsx scripts/verify-ollama.ts
```

## Environment Variables

```env
OLLAMA_BASE_URL=http://localhost:11434/v1
LLM_MODEL=qwen3:30b-a3b
LLM_MODEL_ARABIC=falcon-h1-arabic:7b
EMBEDDING_MODEL=BAAI/bge-m3
EMBEDDING_ENABLED=false
```

## Docker Compose (Production)

```yaml
# docker-compose.yml
services:
  ollama:
    image: ollama/ollama:latest
    container_name: ollama
    restart: unless-stopped
    ports:
      - "11434:11434"
    volumes:
      - ollama-models:/root/.ollama
    environment:
      - OLLAMA_KEEP_ALIVE=24h
      - OLLAMA_MAX_LOADED_MODELS=2
      - OLLAMA_NUM_PARALLEL=2
    healthcheck:
      test: ["CMD", "ollama", "list"]
      interval: 30s
    # Optional GPU:
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - driver: nvidia
    #           count: all
    #           capabilities: [gpu]

volumes:
  ollama-models:
```

## Model Details

### Qwen 3 30B-A3B (Primary)
- Architecture: Mixture-of-Experts (30B total, ~3B active per token)
- RAM (quantized Q4_K_M): ~19GB
- Context: 128K tokens
- Quality: Best cost/quality curve in 2026 local benchmarks
- License: Apache 2.0

### Falcon-H1R Arabic 7B
- Architecture: Hybrid Mamba-Transformer
- Built by: UAE Technology Innovation Institute (TII)
- RAM: ~5GB
- Arabic benchmark: 71.47% on Open Arabic LLM Leaderboard
- License: TII License (commercial use permitted)

### BGE-M3 (Embeddings, Part 12C)
- Languages: 100+ (Arabic + English in shared vector space)
- Context: 8,192 tokens
- License: Apache 2.0
- Status: Not yet active (EMBEDDING_ENABLED=false)

## Auto-Routing

The system automatically routes based on Arabic character ratio:
- >40% Arabic chars → Falcon-H1 Arabic
- Otherwise → Qwen 3

## Graceful Degradation

If Ollama is not running:
- Documents are still uploaded and chunked (text extraction works without Ollama)
- LLM rule extraction is skipped (document stays at "extracted" status)
- The "Extract Rules" button can be clicked later when Ollama is available
- No errors — just a log message: "Ollama not available — skipping LLM extraction"
