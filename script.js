// --- Global Variables ---
let audioContext;
let mic;
let pitch;
let isListening = false;

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

    startButton.disabled = true;
    startButton.textContent = 'Initializing...';
    statusDiv.textContent = 'Starting audio context...';

    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        statusDiv.textContent = 'Please allow microphone access...';
        mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

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

        if (err) {
            console.error(err);
            statusDiv.textContent = 'An error occurred during pitch detection.';
            stopListening();
            return;
        }

        if (frequency) {
            // *** THE FIX IS HERE ***
            // We now call our own custom freqToMidi function.
            const midiNum = freqToMidi(frequency); 
            const noteName = midiToNoteName(midiNum);
            statusDiv.textContent = `Detected Note: ${noteName} (Frequency: ${frequency.toFixed(2)} Hz)`;

            if (detectedNotes.length === 0 || detectedNotes[detectedNotes.length - 1].note !== noteName) {
                detectedNotes.push({ note: noteName, duration: "q" });
            }
        }

        requestAnimationFrame(getPitch);
    });
}

function stopListening() {
    if (!isListening) return;

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
    if (detectedNotes.length === 0) {
        statusDiv.textContent = 'No notes were detected. Try singing more clearly!';
        return;
    }
    statusDiv.textContent = `Generated sheet music with ${detectedNotes.length} notes.`;
    drawVexflowNotes();
}

// --- VexFlow Drawing Function ---
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

// --- Helper Functions ---

/**
 * Converts a frequency in Hz to a MIDI note number.
 * @param {number} frequency The frequency in Hz.
 * @returns {number} The corresponding MIDI note number.
 */
function freqToMidi(frequency) {
    // The formula to convert frequency to a MIDI note number is:
    // MIDI = 69 + 12 * log2(frequency / 440)
    const midi = 69 + 12 * Math.log2(frequency / 440);
    return Math.round(midi); // We round to the nearest whole number for the note
}

/**
 * Converts a MIDI number to a standard note name (e.g., 69 -> "A/4").
 * @param {number} midi The MIDI note number.
 * @returns {string} The note name string.
 */
function midiToNoteName(midi) {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midi / 12) - 1;
    const noteIndex = midi % 12;
    return `${noteNames[noteIndex]}/${octave}`;
}
