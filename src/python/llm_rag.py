#!/usr/bin/env python3
"""
LLM RAG Service for Code Explanation
Uses DeepSeek-Coder for high-quality code understanding and explanation.
"""

import json
import sys
import signal
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM
from typing import List, Dict, Any, Optional

class CodeRAGService:
    def __init__(self, model_name: str = "Qwen/Qwen2.5-Coder-1.5B-Instruct"):
        self.model_name = model_name
        self.tokenizer: Optional[AutoTokenizer] = None
        self.model: Optional[AutoModelForCausalLM] = None
        self.device = self._get_best_device()
        self.max_context = 4096  # Conservative context length
        
    def _get_best_device(self) -> str:
        """Get the best available device for inference."""
        if torch.cuda.is_available():
            return "cuda"
        elif torch.backends.mps.is_available():
            return "mps"
        else:
            return "cpu"
    
    def load_model(self) -> None:
        """Load the model and tokenizer."""
        if self.model is not None:
            return  # Already loaded
            
        print(json.dumps({
            "type": "status", 
            "message": f"Loading {self.model_name}... (this may take 2-3 minutes)"
        }), file=sys.stderr, flush=True)
        
        try:
            # Load tokenizer
            self.tokenizer = AutoTokenizer.from_pretrained(
                self.model_name,
                trust_remote_code=True
            )
            
            # Load model with optimizations
            self.model = AutoModelForCausalLM.from_pretrained(
                self.model_name,
                torch_dtype=torch.float16 if self.device != "cpu" else torch.float32,
                device_map="auto" if self.device == "cuda" else None,
                trust_remote_code=True,
                low_cpu_mem_usage=True
            )
            
            if self.device != "cuda":  # For MPS or CPU
                self.model = self.model.to(self.device)
            
            # Ensure we have a pad token
            if self.tokenizer.pad_token is None:
                self.tokenizer.pad_token = self.tokenizer.eos_token
            
            print(json.dumps({
                "type": "status", 
                "message": f"Model loaded successfully on {self.device}!"
            }), file=sys.stderr, flush=True)
            
        except Exception as e:
            raise RuntimeError(f"Failed to load model: {str(e)}")
    
    def format_search_context(self, search_results: List[Dict[str, Any]], max_results: int = 8) -> str:
        """Format search results into a readable context for the LLM."""
        if not search_results:
            return "No search results provided."
        
        # Group and prioritize the most relevant code snippets
        context_parts = []
        
        for i, result in enumerate(search_results[:max_results], 1):
            file_path = result.get('file_path', 'Unknown file')
            node_type = result.get('node_type', 'Unknown')
            similarity = result.get('similarity', 0)
            source_text = result.get('source_text', 'No source available')
            
            # Truncate very long source text but keep it readable
            if len(source_text) > 600:
                source_text = source_text[:600] + "..."
            
            # Focus on code content rather than file structure
            context_parts.append(f"""
Code Snippet {i} (Relevance: {similarity:.1%}) from {file_path.split('/')[-1]}:
{source_text}
""")
        
        return "\n".join(context_parts)
    
    def create_messages(self, query: str, context: str) -> List[Dict[str, str]]:
        """Create the message structure for the LLM."""
        system_prompt = """You are a senior software engineer providing concise code explanations. Your goal is to synthesize search results into a single, coherent explanation.

Guidelines:
- Write 1-2 paragraphs maximum
- Focus on the overall approach and key mechanisms
- Explain how the pieces work together as a unified system
- Use clear, developer-friendly language
- Avoid file-by-file breakdowns - instead provide a unified explanation
- Be direct and specific about what the code accomplishes"""

        user_prompt = f"""Query: "{query}"

Based on these search results from the codebase, provide a single, unified explanation of how this functionality works:

{context}

Write a cohesive explanation (1-2 paragraphs) that explains the overall approach and implementation for "{query}" without breaking it down file-by-file."""

        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
    
    def generate_explanation(self, query: str, search_results: List[Dict[str, Any]]) -> str:
        """Generate a code explanation based on search results."""
        if not self.model or not self.tokenizer:
            self.load_model()
        
        # Format context
        context = self.format_search_context(search_results)
        
        # Create messages
        messages = self.create_messages(query, context)
        
        # Apply chat template
        try:
            # For models that support chat templates
            formatted_prompt = self.tokenizer.apply_chat_template(
                messages,
                add_generation_prompt=True,
                tokenize=False
            )
        except Exception:
            # Fallback for models without chat templates
            formatted_prompt = f"{messages[0]['content']}\n\n{messages[1]['content']}\n\nAssistant:"
        
        # Tokenize
        inputs = self.tokenizer(
            formatted_prompt,
            return_tensors="pt",
            truncation=True,
            max_length=self.max_context - 512,  # Reserve space for response
            padding=True
        ).to(self.device)
        
        # Generate response
        try:
            with torch.no_grad():
                outputs = self.model.generate(
                    **inputs,
                    max_new_tokens=400,  # Balanced for complete but concise responses
                    temperature=0.6,     # Slightly lower for more focused output
                    do_sample=True,
                    top_p=0.85,         # More focused sampling
                    pad_token_id=self.tokenizer.eos_token_id,
                    repetition_penalty=1.15  # Slightly higher to avoid repetition
                )
            
            # Decode response
            generated_text = self.tokenizer.decode(
                outputs[0][inputs['input_ids'].shape[-1]:],
                skip_special_tokens=True
            )
            
            return generated_text.strip()
            
        except Exception as e:
            raise RuntimeError(f"Generation failed: {str(e)}")

# Global service instance
rag_service = None

def signal_handler(signum, frame):
    """Handle shutdown signals gracefully."""
    print(json.dumps({"type": "shutdown"}), flush=True)
    sys.exit(0)

def process_request(request_data: Dict[str, Any]) -> Dict[str, Any]:
    """Process a single RAG request."""
    global rag_service
    
    try:
        query = request_data.get('query', '')
        search_results = request_data.get('search_results', [])
        
        if not query:
            return {
                "success": False,
                "error": "Query is required",
                "model": rag_service.model_name if rag_service else "unknown"
            }
        
        if not search_results:
            return {
                "success": False, 
                "error": "No search results provided",
                "model": rag_service.model_name if rag_service else "unknown"
            }
        
        # Initialize service if needed
        if rag_service is None:
            model_name = request_data.get('model', 'Qwen/Qwen2.5-Coder-1.5B-Instruct')
            rag_service = CodeRAGService(model_name)
            rag_service.load_model()
        
        # Generate explanation
        explanation = rag_service.generate_explanation(query, search_results)
        
        return {
            "success": True,
            "explanation": explanation,
            "model": rag_service.model_name,
            "device": rag_service.device
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "model": rag_service.model_name if rag_service else "unknown"
        }

def main():
    """Main server loop - handles both one-shot and persistent modes."""
    global rag_service
    
    # Set up signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        # Read input
        input_data = json.loads(sys.stdin.read())
        
        # Process request
        result = process_request(input_data)
        
        # Send response
        print(json.dumps(result), flush=True)
        
    except json.JSONDecodeError as e:
        error_result = {
            "success": False,
            "error": f"Invalid JSON input: {str(e)}",
            "model": "unknown"
        }
        print(json.dumps(error_result), flush=True)
        sys.exit(1)
        
    except Exception as e:
        error_result = {
            "success": False,
            "error": f"Unexpected error: {str(e)}",
            "model": rag_service.model_name if rag_service else "unknown"
        }
        print(json.dumps(error_result), flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
