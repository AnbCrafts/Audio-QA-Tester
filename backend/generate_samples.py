import asyncio
import os
import edge_tts

# Voices:
# Rep: en-US-GuyNeural (Professional male)
# Customer: en-US-AriaNeural (Professional female / inquisitive)

DIALOGUE_GREEN = [
    ("en-US-GuyNeural", "Good morning David! Thanks for taking the time to connect today. How has your week been treating you?"),
    ("en-US-AriaNeural", "Morning Marcus. Honestly, pretty hectic. We have a board meeting on Friday and budget scrutiny is intense right now."),
    ("en-US-GuyNeural", "I understand completely. Let us keep today focused on your immediate priorities so we make the best use of your twenty minutes."),
    ("en-US-AriaNeural", "The solution looks great, but your standard plan is nearly forty thousand dollars annually. In this economic climate, that is going to be dead on arrival with our CFO."),
    ("en-US-GuyNeural", "I completely hear you regarding Q3 budget freezes, David. Let us not force an enterprise tier right away if the immediate need is just workflow automation."),
    ("en-US-AriaNeural", "That would help. What would a pilot or smaller tier look like for just the core ops team?"),
    ("en-US-GuyNeural", "We can isolate the pilot to 15 seats. It brings the initial commitment down under twelve thousand dollars with full migration support included."),
    ("en-US-AriaNeural", "Okay, that might actually pass review. Can you put that in writing?"),
    ("en-US-GuyNeural", "Take your time discussing this with Sarah. I will prepare an itemized breakdown with tier-one pricing by tomorrow 3 PM."),
    ("en-US-AriaNeural", "Once you send that over, I will run through the numbers with Sarah on Thursday morning."),
    ("en-US-GuyNeural", "Sounds like a great plan. I will also loop in our solutions architect so we can schedule a quick 15-minute security review next week.")
]

DIALOGUE_RED = [
    ("en-US-GuyNeural", "Yeah hi Kevin, what questions did you have? I only have about ten minutes before my next demo."),
    ("en-US-AriaNeural", "Hi Derek. We were testing the webhook ingestion over the weekend and ran into rate-limiting errors. We wanted to clarify if custom rate limits are possible."),
    ("en-US-GuyNeural", "It is written in our documentation. The rate limits are standard across all tiers."),
    ("en-US-AriaNeural", "Right, but the docs mention enterprise tiers have configurable burst capacity, which is why we wanted to double-check."),
    ("en-US-GuyNeural", "Look, if your engineering team cannot understand basic webhook documentation, I do not think any vendor is going to solve your issues."),
    ("en-US-AriaNeural", "Excuse me? There is no need for that tone. We are evaluating whether to spend fifty thousand dollars with your company."),
    ("en-US-GuyNeural", "I have explained this three times already. We do not discount for early-stage companies, so take it or leave it."),
    ("en-US-GuyNeural", "I will paste the doc link in an email by the end of the day. Goodbye.")
]

async def create_call_audio(dialogue, output_path):
    temp_files = []
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    # Generate audio clips for each turn
    for i, (voice, text) in enumerate(dialogue):
        temp_file = f"{output_path}_turn_{i}.mp3"
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(temp_file)
        temp_files.append(temp_file)

    # Concatenate clips
    with open(output_path, "wb") as outfile:
        for t_file in temp_files:
            with open(t_file, "rb") as infile:
                outfile.write(infile.read())
            try:
                os.remove(t_file)
            except OSError:
                pass
    print(f"Generated test call: {output_path} ({os.path.getsize(output_path)} bytes)")

async def main():
    out_dir = os.path.join(os.path.dirname(__file__), "sample_audio")
    await create_call_audio(DIALOGUE_GREEN, os.path.join(out_dir, "test_call_green.m4a"))
    await create_call_audio(DIALOGUE_RED, os.path.join(out_dir, "test_call_red.m4a"))

if __name__ == "__main__":
    asyncio.run(main())
