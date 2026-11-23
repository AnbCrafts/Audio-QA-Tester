import requests
import json

url = 'http://127.0.0.1:8000/api/analyze'
file_path = r'C:\Users\HP\Downloads\WhatsApp Audio 2026-11-23 at 08.24.51.m4a'
config = {
    'presetId': 'saas_sales',
    'presetName': 'B2B SaaS Sales',
    'sensitivity': 'balanced',
    'toneCriteria': 'Representative must be polite, helpful, and respectful.',
    'actionItemScope': 'explicit_commitments',
    'customForbiddenPhrases': [],
    'repSpeakerId': 'auto',
    'aiProvider': 'gemini'
}

print("Sending WhatsApp audio to /api/analyze...")
with open(file_path, 'rb') as f:
    files = {'file': (file_path, f, 'audio/mp4')}
    data = {'config': json.dumps(config)}
    resp = requests.post(url, files=files, data=data, timeout=120)

print("Status:", resp.status_code)
if resp.status_code == 200:
    res = resp.json()
    print("Rating:", res['tone']['rating'])
    print("Headline:", res['tone']['headline'])
    print("Transcript lines count:", len(res['transcript']))
    print("\n--- FIRST FEW TRANSCRIPT TURNS ---")
    for s in res['transcript'][:5]:
        print(f"[{s['timestamp']}] {s['speaker']}: {s['text']}")
else:
    print("Error:", resp.text)
