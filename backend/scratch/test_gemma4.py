import httpx
import asyncio
import json

async def test_model():
    api_key = "AIzaSyAejNGUM9UbvITM1uLGGUvWFaYeus2TDjI"
    model = "gemma-4-26b-a4b-it"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": "Hello, are you working?"}]
            }
        ]
    }
    
    async with httpx.AsyncClient() as client:
        print(f"Testing {model}...")
        response = await client.post(url, json=payload)
        print(f"Status: {response.status_code}")
        print(f"Body: {response.text}")

if __name__ == "__main__":
    asyncio.run(test_model())
