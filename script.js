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


// ===================================================================
// === THIS IS THE UPDATED AND CORRECTED FUNCTION ===
// ===================================================================

function drawVexflowNotes() {
    const { Renderer, Stave, StaveNote, Formatter, Voice, Accidental } = Vex.Flow;

    // Clear any previous rendering
    sheetMusicDiv.innerHTML = '';
    
    // Exit if no notes are detected
    if (detectedNotes.length === 0) return;

    // --- 1. Group notes into measures ---
    const notesPerMeasure = 4; // Because we are in 4/4 and all notes are quarter notes
    const measures = [];
    for (let i = 0; i < detectedNotes.length; i += notesPerMeasure) {
        const chunk = detectedNotes.slice(i, i + notesPerMeasure);
        measures.push(chunk);
    }
    
    // --- 2. Create VexFlow StaveNotes and add accidentals ---
    const vexMeasures = measures.map(measure => {
        return measure.map(item => {
            const noteKey = item.note.toLowerCase();
            const staveNote = new StaveNote({
                keys: [noteKey],
                duration: item.duration,
            });
            // If the note has a sharp or flat, add it as an "accidental"
            if (noteKey.includes('#')) {
                staveNote.addAccidental(0, new Accidental('#'));
            }
            if (noteKey.includes('b')) {
                staveNote.addAccidental(0, new Accidental('b'));
            }
            return staveNote;
        });
    });

    // --- 3. Draw each measure one by one ---
    const renderer = new Renderer(sheetMusicDiv, Renderer.Backends.SVG);
    const staveWidth = 250; // The width of a single measure
    renderer.resize(staveWidth * vexMeasures.length + 50, 150); // Total width needed
    const context = renderer.getContext();
    let currentX = 10; // Starting X position for the first stave

    vexMeasures.forEach((notes, index) => {
        const stave = new Stave(currentX, 40, staveWidth);
        // Add clef and time signature to the first measure only
        if (index === 0) {
            stave.addClef('treble').addTimeSignature('4/4');
        }
        
        stave.setContext(context).draw();

        // Create a voice for the current measure
        const voice = new Voice({ num_beats: notes.length, beat_value: 4 });
        voice.addTickables(notes);

        // Format and draw the voice
        new Formatter().joinVoices([voice]).format([voice], staveWidth - 20);
        voice.draw(context, stave);
        
        // Move the X position for the next stave
        currentX += staveWidth;
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
