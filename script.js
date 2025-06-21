// --- Global Variables ---
let audioContext;
let mic;
let pitch;
let isListening = false;
let modelReady = false;

let detectedNotes = [];

// --- UI Elements ---
const startButton = document.getElementById('startButton');
const statusDiv = document.getElementById('status');
const sheetMusicDiv = document.getElementById('sheet-music');

const modelURL = 'https://cdn.jsdelivr.net/gh/ml5js/ml5-data-and-models/models/pitch-detection/crepe/';

// --- Event Listeners ---
startButton.addEventListener('click', toggleListening);

// --- Core Functions ---

function toggleListening() {
    if (!isListening) {
        startListening();
    } else {
        stopListening();
    }
}

async function startListening() {
    if (isListening || !startButton.disabled === false) return;
    console.log("%cStarting listening process...", "color: blue; font-weight: bold;"); // --- DEBUGGING ---

    startButton.disabled = true;
    startButton.textContent = 'Initializing...';
    statusDiv.textContent = 'Starting audio context...';
    
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        console.log("AudioContext is ready.", audioContext); // --- DEBUGGING ---

        statusDiv.textContent = 'Please allow microphone access...';
        mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        console.log("Microphone access granted.", mic); // --- DEBUGGING ---

        statusDiv.textContent = 'Loading machine learning model...';
        pitch = await ml5.pitchDetection(modelURL, audioContext, mic, modelLoaded);

    } catch (error) {
        console.error("Failed to start listening:", error);
        statusDiv.textContent = 'Error: Could not access microphone. Please grant permission and try again.';
        startButton.disabled = false;
        startButton.textContent = 'Start Listening';
    }
}

function modelLoaded() {
    console.log("%cModel loaded successfully!", "color: green; font-weight: bold;"); // --- DEBUGGING ---
    statusDiv.textContent = 'Model loaded! Listening for notes...';
    isListening = true;
    startButton.disabled = false;
    startButton.textContent = 'Stop Listening';
    startButton.classList.add('listening');

    detectedNotes = [];
    sheetMusicDiv.innerHTML = '';

    getPitch();
}

function getPitch() {
    pitch.getPitch((err, frequency) => {
        if (!isListening) {
            return;
        }

        // --- THE MOST IMPORTANT DEBUGGING LINE ---
        // This will show us what the model is hearing on every frame.
        console.log(`getPitch running. Frequency: ${frequency}`);

        if (err) {
            console.error(err);
            statusDiv.textContent = 'An error occurred during pitch detection.';
            stopListening();
            return;
        }

        if (frequency) {
            const midiNum = ml5.freqToMidi(frequency);
            const noteName = midiToNoteName(midiNum);
            statusDiv.textContent = `Detected Note: ${noteName} (Frequency: ${frequency.toFixed(2)} Hz)`;

            if (detectedNotes.length === 0 || detectedNotes[detectedNotes.length - 1].note !== noteName) {
                console.log(`%cNOTE PUSHED: ${noteName}`, "color: purple;"); // --- DEBUGGING ---
                detectedNotes.push({ note: noteName, duration: "q" });
            }
        }
        
        requestAnimationFrame(getPitch);
    });
}

function stopListening() {
    if (!isListening) return;
    console.log("%cStopping listening process...", "color: red; font-weight: bold;"); // --- DEBUGGING ---

    isListening = false;
    
    if (mic) {
        mic.getTracks().forEach(track => track.stop());
    }

    startButton.textContent = 'Start Listening';
    startButton.classList.remove('listening');
    statusDiv.textContent = 'Processing detected notes...';

    processAndDrawNotes();
}

function processAndDrawNotes() {
    console.log("Final detected notes array:", detectedNotes); // --- DEBUGGING ---
    if (detectedNotes.length === 0) {
        statusDiv.textContent = 'No notes were detected. Check console for frequency logs.';
        return;
    }
    statusDiv.textContent = `Generated sheet music with ${detectedNotes.length} notes.`;
    drawVexflowNotes();
}

// (The rest of the file - drawVexflowNotes and midiToNoteName - remains the same)
// ... paste the drawVexflowNotes and midiToNoteName functions from the previous version here ...

function drawVexflowNotes() {
    const { Renderer, Stave, StaveNote, Formatter, Voice } = Vex.Flow;
    sheetMusicDiv.innerHTML = '';
    const requiredWidth = detectedNotes.length * 60 + 120;
    const renderer = new Renderer(sheetMusicDiv, Renderer.Backends.SVG);
    renderer.resize(requiredWidth, 150);
    const context = renderer.getContext();
    const stave = new Stave(10, 40, requiredWidth - 20);
    stave.addClef('treble').addTimeSignature('4/4');
    stave.setContext(context).draw();
    const vexNotes = detectedNotes.map(item => {
        const note = new StaveNote({
            keys: [item.note.toLowerCase()],
            duration: item.duration,
        });
        if (item.note.includes('#')) {
            note.addAccidental(0, new Vex.Flow.Accidental('#'));
        }
        return note;
    });
    const voice = new Voice({ num_beats: detectedNotes.length, beat_value: 4 });
    voice.addTickables(vexNotes);
    new Formatter().joinVoices([voice]).format([voice], requiredWidth - 100);
    voice.draw(context, stave);
}

function midiToNoteName(midi) {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midi / 12) - 1;
    const noteIndex = midi % 12;
    return `${noteNames[noteIndex]}/${octave}`;
}
