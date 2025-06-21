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
    if (isListening || startButton.disabled) return;

    startButton.disabled = true;
    startButton.textContent = 'Initializing...';
    statusDiv.textContent = 'Starting audio context...';

    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        statusDiv.textContent = 'Please allow microphone access...';
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        mic = stream; // Save the stream to stop it later

        statusDiv.textContent = 'Loading machine learning model...';
        pitch = await ml5.pitchDetection(modelURL, audioContext, stream, modelLoaded);

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
            const midiNum = freqToMidi(frequency);
            const noteName = midiToNoteName(midiNum);
            statusDiv.textContent = `Detected Note: ${noteName} (Frequency: ${frequency.toFixed(2)} Hz)`;

            // Add note only if it's different from the last one to avoid duplicates
            if (detectedNotes.length === 0 || detectedNotes[detectedNotes.length - 1].note !== noteName) {
                detectedNotes.push({ note: noteName, duration: "q" }); // 'q' for quarter note
            }
        }

        // Keep listening
        requestAnimationFrame(getPitch);
    });
}

function stopListening() {
    if (!isListening) return;

    isListening = false;

    // Stop the microphone track
    if (mic) {
        mic.getTracks().forEach(track => track.stop());
    }
    // Close the audio context to release resources
    if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
    }

    startButton.textContent = 'Start Listening';
    startButton.classList.remove('listening');
    statusDiv.textContent = 'Processing detected notes...';

    processAndDrawNotes();
}

function processAndDrawNotes() {
    if (detectedNotes.length === 0) {
        statusDiv.textContent = 'No notes were detected. Try singing more clearly!';
        sheetMusicDiv.innerHTML = ''; // Clear the area
        return;
    }
    statusDiv.textContent = `Generated sheet music with ${detectedNotes.length} notes.`;
    drawVexflowNotes();
}

// ===================================================================
// === THIS IS THE UPDATED AND CORRECTED FUNCTION ===
// ===================================================================
function drawVexflowNotes() {
    // Make sure Vex is available
    if (typeof Vex === 'undefined') {
        statusDiv.textContent = "Error: VexFlow library not loaded.";
        return;
    }

    const { Renderer, Stave, StaveNote, Formatter, Voice } = Vex.Flow;

    // Clear any previous rendering
    sheetMusicDiv.innerHTML = '';

    // Exit if no notes are detected
    if (detectedNotes.length === 0) return;

    // --- 1. Group notes into measures ---
    const notesPerMeasure = 4; // Because we are in 4/4 and all notes are quarter notes
    const measures = [];
    for (let i = 0; i < detectedNotes.length; i += notesPerMeasure) {
        measures.push(detectedNotes.slice(i, i + notesPerMeasure));
    }

    // --- 2. Create VexFlow StaveNotes ---
    const vexMeasures = measures.map(measure => {
        return measure.map(item => {
            // VexFlow expects lowercase note names, e.g., "c#/4" instead of "C#/4"
            const noteKey = item.note.toLowerCase();
            return new StaveNote({
                keys: [noteKey],
                duration: item.duration,
                auto_stem: true // Automatically determine stem direction
            });
        });
    });

    // --- 3. Draw each measure ---
    const totalWidth = vexMeasures.length * 250 + 80; // Calculate width needed for all measures
    const renderer = new Renderer(sheetMusicDiv, Renderer.Backends.SVG);
    renderer.resize(totalWidth, 150);
    const context = renderer.getContext();
    let currentX = 0;

    vexMeasures.forEach((notes, index) => {
        const stave = new Stave(currentX, 40, 250);
        // Add clef and time signature to the first measure only
        if (index === 0) {
            stave.addClef('treble').addTimeSignature('4/4');
        }

        stave.setContext(context).draw();

        // Create a voice for the current measure's notes
        const voice = new Voice({ num_beats: notes.length, beat_value: 4 });
        voice.addTickables(notes);

        // Format and draw the voice
        new Formatter().joinVoices([voice]).format([voice], 200); // 200 is formatting width
        voice.draw(context, stave);

        // Move the X position for the next stave
        currentX += stave.getWidth();
    });
}


// --- Helper Functions ---
function freqToMidi(frequency) {
    const midi = 69 + 12 * Math.log2(frequency / 440);
    return Math.round(midi);
}

function midiToNoteName(midi) {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midi / 12) - 1;
    const noteIndex = midi % 12;
    return `${noteNames[noteIndex]}/${octave}`;
}
