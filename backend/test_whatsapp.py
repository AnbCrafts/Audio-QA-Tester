import os
import json
from dotenv import load_dotenv
load_dotenv('f:/ScaleWorks_Assignment/backend/.env')
from google import genai
from google.genai import types

client = genai.Client(api_key=os.getenv('GEMINI_API_KEY'))
audio_path = r'C:\Users\HP\Downloads\WhatsApp Audio 2026-11-23 at 08.24.51.m4a'

print("Uploading audio file to Gemini...")
uploaded = client.files.upload(file=audio_path)
print("Uploaded file successfully:", uploaded.name)

prompt = """
This is an audio phone call between a Sales Representative and a Customer. The call is in Hindi / Hinglish.
1. Transcribe the conversation accurately with timestamps and distinguish speakers (Sales Rep vs Customer). You can write the Hindi dialogue in Roman Hindi / Hinglish or Devanagari Hindi with English context so anyone can understand.
2. Evaluate the Sales Representative's tone: Mark RED if negative, rude, hostile, dismissive; otherwise mark GREEN. Base the judgment on the representative, NOT the customer.
3. Identify concrete commitments and follow-ups. Do NOT invent owners or deadlines.
Return a valid JSON object matching the requested schema.
"""

print("Running Gemini 3.8 Flash analysis...")
resp = client.models.generate_content(
    model='gemini-3.8-flash',
    contents=[uploaded, prompt],
    config=types.GenerateContentConfig(
        response_mime_type='application/json',
        temperature=0.2
    )
)
print("RESPONSE SUCCESS!")
data = json.loads(resp.text)
print(json.dumps(data, indent=2, ensure_ascii=False)[:1200])
