const state = {
	carMatch: {},
	carList: [],
	engineList: [],
	engineOrder: [],
	matched: new Set(),
	timerSeconds: 0,
	timerInterval: null,
	gameActive: false,
	currentRoast: null,
	ratchetAudio: null,
	currentRoastAudio: null,
};

let draggedEngine = null;
let dragGhost = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let currentHoverSlot = null;

const audioPaths = {
	start: "Sound audio files/Sling_bro_game.ogg",
	ratchet: "Sound audio files/Ratchet.ogg",
	wrong: "Sound audio files/gear grind.ogg",
	success: "Sound audio files/success.ogg",
	tim: "Sound audio files/tim game help.ogg",
	roasts: [
		"Sound audio files/granny roast.ogg",
		"Sound audio files/Wrecker roast.ogg",
		"Sound audio files/ford man roast.ogg",
	],
};

const roastCharacterMap = {
	"granny roast.ogg": "granny",
	"Wrecker roast.ogg": "wrecker",
	"ford man roast.ogg": "ford_man",
};

const roastCharacterText = {
	granny: "Granny",
	wrecker: "Wrecker",
	ford_man: "Old Man Ford",
};

const helpChars = {
	closed: "Tim Naylor Help/tim_help_mouth_closed.png",
	open: "Tim Naylor Help/tim_help_mouth_open.png",
};

const matchFiles = [
	{ car: "57_chevy", engine: "400_chevy" },
	{ car: "65_cuda", engine: "Mopar_hemi" },
	{ car: "65_dodge", engine: "slant_6" },
	{ car: "65_mustang", engine: "BOSS_ 429" },
	{ car: "67_Cougar", engine: "289_hi_po" },
	{ car: "69_karm_ghia", engine: "VW_engine" },
	{ car: "70_AMC", engine: "AMC_engine" },
	{ car: "72_chevelle", engine: "Chevy_ 454" },
];

function normalize(value) {
	return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findMatchingFile(name, fileList, defaultExt = "png") {
	const normalized = normalize(name);
	const found = fileList.find(
		(file) => normalize(file.replace(/\.[^.]+$/, "")) === normalized,
	);
	if (found) {
		return found;
	}
	return `${name}.${defaultExt}`;
}

function assetPath(folder, fileName) {
	return encodeURI(`${folder}/${fileName}`);
}

function shuffle(array) {
	for (let i = array.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
	return array;
}

async function loadMappings() {
	state.carList = matchFiles.map((m) => m.car);
	state.engineList = matchFiles.map((m) => m.engine);
	state.engineOrder = shuffle([...state.engineList]);
	state.carMatch = {};
	matchFiles.forEach((mapping) => {
		state.carMatch[mapping.car] = mapping.engine;
	});
}

function buildGameBoard() {
	const carGrid = document.getElementById("car-grid");
	const engineTray = document.getElementById("engine-tray");
	carGrid.innerHTML = "";
	engineTray.innerHTML = "";

	state.carList.forEach((carKey) => {
		const carSlot = document.createElement("div");
		carSlot.className = "car-slot";
		carSlot.dataset.car = carKey;
		console.log(carKey);
		const carFile = carKey + ".png";
		carSlot.innerHTML = `
			<div class="car-image-wrap">
				<img class="car-img" src="${assetPath("cars", carFile)}" alt="${carKey}" draggable="false" />
			</div>
			<div class="car-name">${carKey.replace(/_/g, " ")}</div>
		`;

		carGrid.appendChild(carSlot);
	});

	state.engineOrder.forEach((engineKey) => {
		const engineFile = engineKey + ".png";
		const engineIcon = document.createElement("img");
		engineIcon.className = "engine-icon";
		engineIcon.dataset.engine = engineKey;
		engineIcon.src = assetPath("Engines", engineFile);
		engineIcon.alt = engineKey;
		engineIcon.draggable = false;
		engineIcon.style.cursor = "grab";
		engineIcon.addEventListener("mousedown", onEngineMouseDown);
		engineTray.appendChild(engineIcon);
	});
}

function onEngineMouseDown(event) {
	if (event.button !== 0) {
		return;
	}
	event.preventDefault();
	resumeTimer();
	startRatchet();

	draggedEngine = event.currentTarget;
	const rect = draggedEngine.getBoundingClientRect();
	dragOffsetX = event.clientX - rect.left;
	dragOffsetY = event.clientY - rect.top;

	dragGhost = draggedEngine.cloneNode(true);
	dragGhost.className = "drag-ghost";
	Object.assign(dragGhost.style, {
		position: "fixed",
		left: `${rect.left}px`,
		top: `${rect.top}px`,
		width: `${rect.width}px`,
		height: `${rect.height}px`,
		pointerEvents: "none",
		opacity: "0.8",
		zIndex: "10000",
		cursor: "grabbing",
	});
	document.body.appendChild(dragGhost);
	draggedEngine.style.opacity = "0.35";

	document.addEventListener("mousemove", onDocumentMouseMove);
	document.addEventListener("mouseup", onDocumentMouseUp);
}

function onDocumentMouseMove(event) {
	if (!dragGhost) {
		return;
	}
	dragGhost.style.left = `${event.clientX - dragOffsetX}px`;
	dragGhost.style.top = `${event.clientY - dragOffsetY}px`;

	const element = document.elementFromPoint(event.clientX, event.clientY);
	const hoverSlot = element?.closest(".car-slot");
	if (currentHoverSlot && currentHoverSlot !== hoverSlot) {
		currentHoverSlot.classList.remove("drag-over");
		currentHoverSlot = null;
	}
	if (hoverSlot && hoverSlot !== currentHoverSlot) {
		hoverSlot.classList.add("drag-over");
		currentHoverSlot = hoverSlot;
	}
}

function onDocumentMouseUp(event) {
	if (!draggedEngine) {
		return;
	}
	stopRatchet();

	const element = document.elementFromPoint(event.clientX, event.clientY);
	const carSlot = element?.closest(".car-slot");
	if (carSlot) {
		const engineKey = draggedEngine.dataset.engine;
		const carKey = carSlot.dataset.car;
		if (engineKey && carKey) {
			if (state.carMatch[carKey] === engineKey) {
				handleMatch(carSlot, engineKey);
			} else {
				handleFail(engineKey, carKey);
			}
		}
	}

	cleanupDrag();
}

function cleanupDrag() {
	if (dragGhost && dragGhost.parentNode) {
		dragGhost.parentNode.removeChild(dragGhost);
	}
	dragGhost = null;
	if (draggedEngine) {
		draggedEngine.style.opacity = "1";
		draggedEngine = null;
	}
	if (currentHoverSlot) {
		currentHoverSlot.classList.remove("drag-over");
		currentHoverSlot = null;
	}
	document.removeEventListener("mousemove", onDocumentMouseMove);
	document.removeEventListener("mouseup", onDocumentMouseUp);
}

function onEngineDragStart(event) {
	resumeTimer();

	const engineKey = event.target.dataset.engine;
	if (!engineKey) {
		return;
	}
	event.dataTransfer.setData("text/plain", engineKey);
	event.dataTransfer.effectAllowed = "move";
	startRatchet();
}

function onEngineDragEnd() {
	stopRatchet();
}

function onCarDragOver(event) {
	event.preventDefault();
	event.dataTransfer.dropEffect = "move";
}

function onCarDragEnter(event) {
	event.currentTarget.classList.add("drag-over");
}

function onCarDragLeave(event) {
	event.currentTarget.classList.remove("drag-over");
}

function onCarDrop(event) {
	event.preventDefault();
	const target = event.currentTarget;
	target.classList.remove("drag-over");
	stopRatchet();
	const engineKey = event.dataTransfer.getData("text/plain");
	const carKey = target.dataset.car;
	if (!engineKey || !carKey) {
		return;
	}
	if (state.carMatch[carKey] === engineKey) {
		handleMatch(target, engineKey);
	} else {
		handleFail(engineKey, carKey);
	}
}

function handleMatch(carSlot, engineKey) {
	if (state.matched.has(engineKey)) {
		return;
	}
	state.matched.add(engineKey);
	const engineIcon = document.querySelector(`[data-engine="${engineKey}"]`);
	if (engineIcon && engineIcon.parentNode) {
		engineIcon.parentNode.removeChild(engineIcon);
	}
	const engineFile = engineKey + ".png";
	const installed = document.createElement("img");
	installed.className = "installed-engine";
	installed.src = assetPath("Engines", engineFile);
	installed.alt = engineKey;
	installed.draggable = false;
	installed.style.pointerEvents = "none";
	const imageWrap = carSlot.querySelector(".car-image-wrap");
	if (imageWrap) {
		imageWrap.appendChild(installed);
	} else {
		carSlot.appendChild(installed);
	}
	setMessage(
		`MATCH! ${engineKey.replace(/_/g, " ")} snapped into ${carSlot.dataset.car.replace(/_/g, " ")}.`,
	);
	setTimMouth(false);
	playAudio(audioPaths.success, false, () => setTimMouth(false));
	if (state.matched.size === state.engineList.length) {
		completeGame(true);
	}
}
function playRoast(character, roastUri) {
	if (state.currentRoastAudio) {
		state.currentRoastAudio.pause();
		state.currentRoastAudio.currentTime = 0;
		state.currentRoastAudio = null;
	}
	setRoastCharacter(character, true);

	const roastAudio = new Audio(encodeURI(roastUri));
	state.currentRoastAudio = roastAudio;

	roastAudio.play().catch(() => {});

	roastAudio.onended = () => {
		if (state.currentRoastAudio === roastAudio) {
			setRoastCharacter(character, false);
			state.currentRoastAudio = null;
		}
	};

	roastAudio.onerror = () => {
		if (state.currentRoastAudio === roastAudio) {
			state.currentRoastAudio = null;
		}
	};
}
function handleFail(engineKey, carKey) {
	playAudio(audioPaths.wrong);
	const roastUri = randomRoast();
	const roastFile = roastUri.split("/").pop();
	const roastChar = roastCharacterMap[roastFile] || "granny";
	setMessage(`Wrong engine for ${carKey.replace(/_/g, " ")}.`);
	playRoast(roastChar, roastUri);
}

function randomRoast() {
	const index = Math.floor(Math.random() * audioPaths.roasts.length);
	return audioPaths.roasts[index];
}

function setRoastCharacter(character, open) {
	const roastImg = document.getElementById("roast-char");
	roastImg.src = encodeURI(
		`Animates Appear talk mouth open closed/${character}_mouth_${open ? "open" : "closed"}.png`,
	);
	roastImg.alt = roastCharacterText[character] || character;

	if (state.roastHideTimeout) {
		clearTimeout(state.roastHideTimeout);
		state.roastHideTimeout = null;
	}

	if (open) {
		roastImg.classList.remove("hidden");
	} else {
		roastImg.classList.remove("hidden");
		state.roastHideTimeout = setTimeout(() => {
			roastImg.classList.add("hidden");
			state.roastHideTimeout = null;
		}, 1000);
	}
}

function playAudio(path, loop = false, onEnd) {
	const audio = new Audio(encodeURI(path));
	audio.loop = loop;
	audio.onended = () => {
		if (onEnd) {
			onEnd();
		}
	};
	audio.onerror = () => {
		if (path === audioPaths.success) {
			audio.src = encodeURI(audioPaths.start);
			audio.play().catch(() => {});
		}
	};
	audio.play().catch(() => {});
	return audio;
}

function startRatchet() {
	if (!state.ratchetAudio) {
		state.ratchetAudio = new Audio(encodeURI(audioPaths.ratchet));
		state.ratchetAudio.loop = true;
		state.ratchetAudio.play().catch(() => {});
	}
}

function stopRatchet() {
	if (state.ratchetAudio) {
		state.ratchetAudio.pause();
		state.ratchetAudio.currentTime = 0;
		state.ratchetAudio = null;
	}
}

function setMessage(text) {
	document.getElementById("message").textContent = text;
}

function setTimMouth(open) {
	document.getElementById("tim-image").src = encodeURI(
		open ? helpChars.open : helpChars.closed,
	);
}

function updateTimerDisplay() {
	const minutes = Math.floor(state.timerSeconds / 60)
		.toString()
		.padStart(2, "0");
	const seconds = (state.timerSeconds % 60).toString().padStart(2, "0");
	document.getElementById("timer").textContent = `${minutes}:${seconds}`;
}

function startCountdown() {
	if (state.timerInterval) {
		clearInterval(state.timerInterval);
	}
	state.timerSeconds = 60;
	updateTimerDisplay();
	state.timerInterval = setInterval(() => {
		state.timerSeconds -= 1;
		updateTimerDisplay();
		if (state.timerSeconds <= 0) {
			completeGame(false);
		}
	}, 1000);
}

function pauseTimer() {
	if (state.timerInterval) {
		clearInterval(state.timerInterval);
		state.timerInterval = null;
	}
}

function resumeTimer() {
	if (
		state.timerInterval ||
		state.timerSeconds <= 0 ||
		state.matched.size === state.engineList.length
	) {
		return;
	}
	state.timerInterval = setInterval(() => {
		state.timerSeconds -= 1;
		updateTimerDisplay();
		if (state.timerSeconds <= 0) {
			completeGame(false);
		}
	}, 1000);
}

function startGame() {
	loadMappings().then(() => {
		buildGameBoard();
		document.getElementById("start-screen").classList.add("hidden");
		document.getElementById("game-screen").classList.remove("hidden");
		document.getElementById("result-popup").classList.add("hidden");
		state.matched = new Set();
		state.gameActive = true;
		state.timerSeconds = 0;
		updateTimerDisplay();
		setTimMouth(false);
		setMessage(
			"Sling Bro: you reckin you can swap engines faster than me um hum?",
		);
		const introAudio = playAudio(audioPaths.start, false, () => {
			setMessage("Go! Start swapping. Must beat Sling Bro!");
			setTimMouth(false);
			startCountdown();
		});
	});
}

function completeGame(win) {
	state.gameActive = false;
	pauseTimer();
	const title = win
		? "Cool, you beat Sling Bro!"
		: "Game Over, you got roasted!";
	const copy = win
		? "All 8 engines are snapped in. You beat Sling Bro and won the garage duel."
		: "The clock ran out before the swaps were finished. The OGs got the last word.";
	document.getElementById("result-title").textContent = title;
	document.getElementById("result-copy").textContent = copy;
	document.getElementById("result-popup").classList.remove("hidden");
	window.parent.postMessage({ type: "gameResults", result: win }, "*");

	if (!win) {
		const roastUri = randomRoast();
		const roastFile = roastUri.split("/").pop();
		const roastChar = roastCharacterMap[roastFile] || "granny";
		setRoastCharacter(roastChar, true);
		const roastAudio = new Audio(encodeURI(roastUri));
		roastAudio.play().catch(() => {});
		roastAudio.onended = () => setRoastCharacter(roastChar, false);
	}
}
let currentTimAudio = null;
function onTimHelpClick() {
	if (!state.gameActive) {
		return;
	}
	if (currentTimAudio) {
		currentTimAudio.pause();
		currentTimAudio.currentTime = 0;
		currentTimAudio = null;
	}
	pauseTimer();
	setTimMouth(true);
	setMessage("Tim Naylor is talking. Countdown paused.");
	const helpAudio = new Audio(encodeURI(audioPaths.tim));
	currentTimAudio = helpAudio;
	helpAudio.play().catch(() => {});
	helpAudio.onended = () => {
		if (currentTimAudio === helpAudio) {
			setTimMouth(false);
			setMessage("Tim is done. Back to the swap.");
			resumeTimer();
			currentTimAudio = null;
		}
	};
	helpAudio.onerror = () => {
		if (currentTimAudio === helpAudio) {
			currentTimAudio = null;
		}
	};
}

document.getElementById("start-btn").addEventListener("click", startGame);
document.getElementById("tim-panel").addEventListener("click", onTimHelpClick);
document.getElementById("restart-btn").addEventListener("click", () => {
	document.getElementById("result-popup").classList.add("hidden");
	startGame();
});

document.addEventListener("dragstart", (event) => {
	event.preventDefault();
});

document.querySelectorAll("img").forEach((img) => {
	if (!img.classList.contains("engine-icon")) {
		img.draggable = false;
	}
});
