import sys
import json
from transformers import AutoTokenizer, AutoModel, AutoModelForCausalLM, pipeline
import torch
import numpy as np

# Load model and tokenizer once - using the mixedbread-ai model by default
MODEL_NAME = "mixedbread-ai/mxbai-embed-large-v1"

tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
model = AutoModel.from_pretrained(MODEL_NAME)

pipe = pipeline("feature-extraction", model=MODEL_NAME)

def get_embedding(code_string, is_query=False):
    # Use text as-is - let the model handle it naturally
    text = code_string
    
    inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=512, padding=True)
    
    with torch.no_grad():
        outputs = model(**inputs)
    
    # Use mean pooling as a safe default for most models
    attention_mask = inputs['attention_mask']
    token_embeddings = outputs.last_hidden_state
    input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
    embedding = torch.sum(token_embeddings * input_mask_expanded, 1) / torch.clamp(input_mask_expanded.sum(1), min=1e-9)
    
    # Normalize the embedding
    embedding = torch.nn.functional.normalize(embedding, p=2, dim=1)
    
    return embedding.squeeze().tolist()

def get_embedding_pipeline(code_string, is_query=False):
    return pipe(code_string, is_query=is_query)

if __name__ == "__main__":
    # Read input from stdin - expect JSON with text and optional is_query flag
    try:
        input_data = sys.stdin.read().strip()
        
        # Try to parse as JSON first, fallback to plain text
        try:
            parsed_input = json.loads(input_data)
            text = parsed_input.get("text", "")
            is_query = parsed_input.get("is_query", False)
        except json.JSONDecodeError:
            # Fallback to treating entire input as text
            text = input_data
            is_query = False
        
        if not text:
            raise ValueError("No text provided")
            
        embedding = get_embedding(text, is_query)
        result = {
            "embedding": embedding,
            "dimensions": len(embedding),
            "model": MODEL_NAME
        }
        print(json.dumps(result))
        
    except Exception as e:
        error_result = {
            "error": str(e),
            "embedding": None
        }
        print(json.dumps(error_result))
        sys.exit(1)

