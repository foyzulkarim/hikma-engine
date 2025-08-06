#!/usr/bin/env python3
"""
Persistent Python embedding server for hikma-engine.
Loads the model once and processes multiple embedding requests efficiently.
"""

import sys
import json
import traceback
from transformers import AutoTokenizer, AutoModel
import torch
import threading
import queue
import signal

# Global model and tokenizer
MODEL_NAME = "mixedbread-ai/mxbai-embed-large-v1"  # Default model
tokenizer = None
model = None
device = None

def setup_model():
    """Initialize the model and tokenizer once."""
    global tokenizer, model, device
    
    try:
        # Determine device (cuda or mps or cpu)
        device = torch.device("cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu")

        # print(json.dumps({"model": MODEL_NAME, "device": device}), flush=True)
        
        # Load tokenizer and model
        tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
        model = AutoModel.from_pretrained(MODEL_NAME)
        model.to(device)
        model.eval()  # Set to evaluation mode
        
        print(json.dumps({"type": "ready"}), flush=True)
        
    except Exception as e:
        error_msg = f"Failed to load model: {str(e)}"
        print(json.dumps({"type": "error", "error": error_msg}), flush=True)
        sys.exit(1)

def get_embedding(text, is_query=False):
    """Generate embedding for given text."""
    try:
        # Use text as-is - let the model handle it naturally
        processed_text = text
        
        # Tokenize
        inputs = tokenizer(
            processed_text, 
            return_tensors="pt", 
            truncation=True, 
            max_length=512, 
            padding=True
        )
        
        # Move to device
        inputs = {k: v.to(device) for k, v in inputs.items()}
        
        # Generate embedding
        with torch.no_grad():
            outputs = model(**inputs)
        
        # Use mean pooling as a safe default for most models
        attention_mask = inputs['attention_mask']
        token_embeddings = outputs.last_hidden_state
        input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
        embedding = torch.sum(token_embeddings * input_mask_expanded, 1) / torch.clamp(input_mask_expanded.sum(1), min=1e-9)
        
        # Normalize the embedding
        embedding = torch.nn.functional.normalize(embedding, p=2, dim=1)
        
        # Convert to list and return
        return embedding.squeeze().cpu().tolist()
        
    except Exception as e:
        raise Exception(f"Embedding generation failed: {str(e)}")

def process_request(request_data):
    """Process a single embedding request."""
    try:
        request_id = request_data.get("id")
        text = request_data.get("text", "")
        is_query = request_data.get("is_query", False)
        
        if not text:
            raise ValueError("No text provided")
        
        # Generate embedding
        embedding = get_embedding(text, is_query)
        
        # Send response
        response = {
            "type": "result",
            "id": request_id,
            "embedding": embedding,
            "dimensions": len(embedding),
            "model": MODEL_NAME
        }
        
        print(json.dumps(response), flush=True)
        
    except Exception as e:
        # Send error response
        error_response = {
            "type": "result",
            "id": request_data.get("id"),
            "error": str(e)
        }
        print(json.dumps(error_response), flush=True)

def signal_handler(signum, frame):
    """Handle shutdown signals gracefully."""
    sys.exit(0)

def main():
    """Main server loop."""
    global MODEL_NAME
    
    # Accept model name as command line argument
    if len(sys.argv) > 1:
        MODEL_NAME = sys.argv[1]
    
    # Set up signal handlers for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Initialize model
    setup_model()
    
    # Process requests line by line
    try:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
                
            try:
                request_data = json.loads(line)
                process_request(request_data)
                
            except json.JSONDecodeError as e:
                error_response = {
                    "type": "result",
                    "id": None,
                    "error": f"Invalid JSON: {str(e)}"
                }
                print(json.dumps(error_response), flush=True)
                
            except Exception as e:
                error_response = {
                    "type": "result", 
                    "id": None,
                    "error": f"Request processing error: {str(e)}"
                }
                print(json.dumps(error_response), flush=True)
                
    except KeyboardInterrupt:
        pass
    except EOFError:
        pass

if __name__ == "__main__":
    main()
