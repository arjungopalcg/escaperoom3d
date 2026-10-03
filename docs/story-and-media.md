# The Brig of the Crimson Gull — story, intro video and voices

This guide covers the story, the shot list for the intro and ending videos (written for Google Flow / Veo),
the voice lines, and which free tools to use. Everything you make goes into
`packages/client/public/media/`; the game uses a file as soon as it exists and falls back to narrated
text cards and the browser voice when it doesn't.

## The story

**Logline.** Caged mutineers on a sinking pirate ship must work together, cage to cage, to escape before the
sea or their captain finishes them.

**Backstory.** Captain Elias Blackwater runs the *Crimson Gull*, the fastest ship on the Saltmarsh Sea, by fear:
short rations, the lash, and a share of every prize going into his private hoard. Three nights ago the crew
(the players) rose against him and lost. He locked the ringleaders in iron cages in the hold and set course for
the **Isle of Bones**, where mutineers are marooned. Tonight a storm drives the ship onto a reef. The hull is
breached and the hold is flooding.

**What changes every run (the mystery).** Someone aboard secretly sides with the crew and slips hint notes
through the floorboards: the cook, the cabin boy, the first mate or the carpenter. Each hint note carries a tell
(onions, childish handwriting, quarterdeck tar, sawdust), so players can guess who it is before the results screen
reveals it. Blackwater has also hidden his gold somewhere on deck, described in a riddle in an unsent letter to
his wife. Finding it gives the treasure ending.

**Characters.**
- **Captain Elias Blackwater**: tall, grey-bearded, scarred cheek, crimson coat, brass spyglass. Never seen up
  close in the game; heard shouting through the hatch. Voice: deep, gravelly, mocking, enjoys himself.
- **The parrot**: scruffy green with a red wing, repeats everything Blackwater says at the wrong moment. It is
  the game's comic relief and a clue-giver.
- **The secret ally**: never seen; only their notes.
- **The crew (players)**: ordinary sailors in rough shirts, bandanas and bare feet.

**Four acts** (the game's fixed spine):
1. *Break the cages*: each cage holds the key to another.
2. *The hold*: pump the bilge, fix the rigging and the lifeboat, decode the map, while the water rises.
3. *The captain's quarters*: his logbook, his sea chest, his secret.
4. *Take the ship*: steer through the reef, fire the signal guns, lower the lifeboat. Nobody escapes alone.

**Endings.** *Full escape*, *Escape with the treasure*, or *Lost at sea*.

## Intro video: shot list for Google Flow (Veo)

Veo makes clips of about 8 seconds, so the intro is seven shots (about 56 s). The game gives players 40 s of
intro before the clock starts and they can skip; a 50–60 s video is fine because the water only starts rising
when the countdown ends.

**Style line**: paste it at the start of every prompt so the shots match each other and the game's look:

> Stylised low-poly 3D animation, chunky faceted shapes, hand-painted textures, warm amber lantern light against
> a cold blue stormy night, heavy rain, cinematic camera, 16:9, no on-screen text, no subtitles.

**Character consistency.** Make one reference image of Blackwater first (prompt below), then use Flow's
*Ingredients to video* with that image for shots 2 and 4 so he looks the same in both.

> Captain reference image: *Low-poly 3D character, pirate captain Elias Blackwater, tall, grey beard, scar
> across left cheek, long crimson coat with brass buttons, tricorn hat, brass spyglass at his belt, cruel smile,
> full body, neutral background.*

| # | Shot prompt (after the style line) | Voice line in the clip |
|---|---|---|
| 1 | Wide aerial shot of a three-masted pirate ship with blood-red sails ploughing through huge storm waves at night, lightning flashing, the camera slowly pushes in toward the stern lanterns. | Narrator: “The Crimson Gull. Fastest ship on the Saltmarsh Sea — and the cruellest captain ever to sail her: Elias Blackwater.” |
| 2 | On the rain-soaked deck, a chaotic mutiny: sailors with cutlasses and belaying pins surge toward the captain (reference image) who stands calmly on the quarterdeck as armed guards close in behind the mutineers. | Narrator: “Three nights ago, you and your shipmates rose against him. You had the numbers. He had the keys.” |
| 3 | Inside a dark ship's hold, a row of iron cages lit by coloured lanterns (green, red, amber, blue, violet); sailors wake up on the floor of the cages, rats scurry, the hull creaks. Slow dolly along the cages. | Narrator: “Now you wake in iron cages in his hold, bound for the Isle of Bones, where mutineers are left for the crabs.” |
| 4 | Low angle from inside the hold looking up through an open deck hatch: the captain (reference image) leans over the hatch holding a lantern, rain falling past him, and laughs. | Captain (deep, gravelly, mocking): “Enjoy your cages, mutineers! By dawn you'll be marooned on the Isle of Bones — if the sea doesn't take you first!” |
| 5 | The ship slams into a jagged reef; inside the hold a timber plank splits and seawater bursts through the hull, quickly flooding the floor around the cages, lanterns swinging. | Narrator: “Then the storm struck. A reef tore open the hull, and the sea came in. The water is rising.” |
| 6 | Close-up: a folded note slides through a gap in the floorboards into a cage, a sailor's hand picks it up; a green parrot on a beam outside the cage tilts its head. | Narrator: “But someone aboard is on your side. A note slides through the floorboards: ‘Trust each other. Every lock has its key in another cage.’” |
| 7 | The caged sailors look at each other across the flooding hold, one reaches a hand through the bars toward the next cage; camera pulls back and up through the deck into the storm, the ship tiny on the sea. | Narrator: “Break out together. Take back the ship. Nobody escapes alone.” |

**Endings** (one clip each, 8–16 s):

| File | Prompt (after the style line) | Voice line |
|---|---|---|
| `ending-escape.mp4` | A lifeboat full of sailors rows away from a sinking pirate ship with red sails; on the tilting deck the captain shakes his fist; dawn breaks through the storm clouds. | Narrator: epilogue `ending-escape` (table below) |
| `ending-treasure.mp4` | Same lifeboat, but an open chest of gold doubloons glitters at the sailors' feet; they cheer; the sinking ship behind them, the captain howling at the rail. | Narrator: `ending-treasure` |
| `ending-lost.mp4` | Inside the hold, the water rises over the cages; lanterns flicker and go out one by one; the camera sinks below the surface into darkness. | Narrator: `ending-lost` |

### Making it in Flow

1. Create a project in Flow and generate the captain reference image (or make it in Gemini and upload it).
2. Generate each shot with **Veo 3** using the prompts above. Veo 3 can generate the spoken line and sound
   effects with the shot: put the line in the prompt as `Narrator voice (deep, weathered British storyteller)
   says: "..."`. Generate 2–4 takes per shot and keep the best.
3. If Veo's voices sound inconsistent from shot to shot, generate the shots **without** dialogue and add the
   narration from the voice files below in an editor instead (step 5). That is usually the better result.
4. Use Flow's Scenebuilder to put the shots in order and trim them, then download the clips or the scene.
5. Optional finishing in a free editor (CapCut desktop or DaVinci Resolve): lay in the narration MP3s, a music
   bed and a title card, then export **H.264 MP4, 1280×720, 24–30 fps**.
6. Save as `packages/client/public/media/intro.mp4` (and the three ending files), commit and push. The game plays
   them automatically.

To join clips and shrink the file without an editor (free, `ffmpeg`):

```bash
# list.txt contains lines like: file 'shot1.mp4'
ffmpeg -f concat -safe 0 -i list.txt -c:v libx264 -crf 26 -preset slow -vf scale=1280:-2 -c:a aac -b:a 128k intro.mp4
```

## Voice lines

The game speaks these lines. Record any of them and save as `packages/client/public/media/voice/<file>`;
the game plays your recording instead of the browser voice. Lines you don't record keep using the browser voice.

**Free voice tools:**
- **Google AI Studio (Gemini text-to-speech)**: free in AI Studio, many voices, and you can direct the delivery
  ("say this gravelly and mocking, like an old pirate captain"). Download as WAV, convert to MP3.
- **ElevenLabs free tier**: very natural voices; the free plan requires attribution and is for non-commercial
  use, so switch to a paid plan before launching commercially.
- **Kokoro / Piper**: open-source voices you run on your own computer, no account or limits.
- Convert to MP3 with `ffmpeg -i line.wav -b:a 96k line.mp3`.

Suggested casting: **Narrator**: calm, weathered British storyteller. **Captain**: deep, gravelly, mocking,
enjoying himself. **Parrot**: high, squawky, fast (record normally, then pitch up about 6 semitones).

| File | Voice | Line |
| --- | --- | --- |
| `voice/intro-1.mp3` | Narrator | The Crimson Gull. Fastest ship on the Saltmarsh Sea — and the cruellest captain ever to sail her: Elias Blackwater. |
| `voice/intro-2.mp3` | Narrator | Three nights ago, you and your shipmates rose against him. You had the numbers. He had the keys. |
| `voice/intro-3.mp3` | Narrator | Now you wake in iron cages in his hold, bound for the Isle of Bones, where mutineers are left for the crabs. |
| `voice/captain-start.mp3` | Captain | Enjoy your cages, mutineers! By dawn you’ll be marooned on the Isle of Bones — if the sea doesn’t take you first! |
| `voice/intro-5.mp3` | Narrator | Then the storm struck. A reef tore open the hull, and the sea came in. The water is rising. |
| `voice/intro-6.mp3` | Narrator | But someone aboard is on your side. A note slides through the floorboards: “Trust each other. Every lock has its key in another cage.” |
| `voice/intro-7.mp3` | Narrator | Break out together. Take back the ship. Nobody escapes alone. |
| `voice/captain-start.mp3` | Captain | Enjoy your cages, mutineers! By dawn you’ll be marooned on the Isle of Bones — if the sea doesn’t take you first! |
| `voice/captain-act2.mp3` | Captain | What’s that racket below? Bosun! Check the hold! …Bosun? Blast this storm! |
| `voice/captain-act3.mp3` | Captain | Stay out of my quarters, you bilge rats! My logbook is none of your business! |
| `voice/captain-act4.mp3` | Captain | Mutiny! On deck, all hands! Stop them before they reach the boat! |
| `voice/captain-lowWater.mp3` | Captain | Hear that? The sea wants you. I can wait. |
| `voice/captain-lost.mp3` | Captain | Down you go. Pity — you’d have fetched a fine price on the Isle. |
| `voice/ending-escape.mp3` | Narrator | The lifeboat pulls away as the Crimson Gull rolls beneath the waves, Blackwater still shaking his fist at the rail. Every one of you made it. |
| `voice/ending-treasure.mp3` | Narrator | You row for Port Haven with every soul aboard — and Blackwater’s gold at your feet. Somewhere behind you, a captain howls at the storm. |
| `voice/ending-lost.mp3` | Narrator | The lanterns gutter out one by one as the sea fills the hold. The Isle of Bones will never see you. Neither will anyone else. |
| `voice/parrot-kraken.mp3` | Parrot | Squawk! Blackwater fears the KRAKEN! Fears the KRAKEN! |
| `voice/parrot-moggy.mp3` | Parrot | Here, MOGGY! Here, MOGGY! Rrrawk! Where’s the cat? |
| `voice/parrot-bilge.mp3` | Parrot | Rum in the BILGE! Rum in the BILGE! Don’t tell! Squawk! |
| `voice/parrot-mother.mp3` | Parrot | To MOTHER! To MOTHER! Hic! Rrrawk! |
| `voice/parrot-mercy.mp3` | Parrot | Fetch me MERCY, boy! MERCY! Squawk! |
| `voice/parrot-turnip.mp3` | Parrot | Pass the TURNIP! TURNIP! Rrrawk! Lovely turnip! |
| `voice/parrot-wig.mp3` | Parrot | Lost his WIG! Lost his WIG! Ha ha! Squawk! |
| `voice/parrot-chatter-1.mp3` | Parrot | Rrrawk! Blackwater’s a cheat! A cheat! |
| `voice/parrot-chatter-2.mp3` | Parrot | Pretty bird! Pretty bird wants a biscuit! |
| `voice/parrot-chatter-3.mp3` | Parrot | Water’s rising! Rising! Squawk! |
| `voice/parrot-chatter-4.mp3` | Parrot | Who’s a mutineer? You’s a mutineer! |
| `voice/parrot-chatter-5.mp3` | Parrot | Fifteen men on a dead man’s chest! Rrrawk! |
| `voice/parrot-chatter-6.mp3` | Parrot | Abandon ship! Abandon… just kidding! Squawk! |
| `voice/parrot-chatter-7.mp3` | Parrot | The cook stole the cheese! The cheese! |
| `voice/parrot-chatter-8.mp3` | Parrot | Isle of Bones! Bones! Bones! |

## Music and sound

The game already makes its own storm, creaks and sound effects in code. For the videos, free music beds:
YouTube Audio Library and Pixabay Music (check each track's licence). Search “sea shanty”, “pirate tension”,
“storm ambience”.
