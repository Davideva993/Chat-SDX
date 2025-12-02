
/*
-The steps:
1)The host generates a nonce, the tempKey (using secretCode1 and Argon), the initKey (public RSA-OAEP) then he registers a room with the roomName and receives the hostToken.
2)The host asks each 1,5s if the other user (joiner) joined the room.
3)The joiner generates the defKey (AES), joins the room (with roomName) and receives the joinerToken.
4)The host, knowing the joiner is present, generates a self-destruct timer and sends the initKey encrypted by the tempKey and the nonce to the server.
5)The joiner asks for the nonce and encrypted initKey. Then he generates the tempKey (secretCode1, nonce and Argon) and uses it to decrypt the initKey
6) The joiner starts a self-destruct timer, encrypts the defKey + random nonce using the decrypted initKey and sends it to the server.
7) The host polls every 1.5 s for the defKey encrypted by the initKey. When it arrives it is decrypted, the trailing 16-byte nonce is removed, and the clean defKey is imported. The self-destruct timer is cleared.
8)The host Encrypts the hash of secretCode2 using the defKey and sends it to the server.
9)The joiner ask for the encrypted hash of SecretCode2, decrypts it, compares it. If matches, the processus is validated and the joiner timer cleared.
----the chat starts---
10)The sender encrypts message + a fresh AES + a nonce (derivationNonce) using currentDefKey (defKey for the first time) and sends it. Then updates cumulativeNonce (first message: =derivationNonce; later: SHA-256(old||new)[0:15]) and derives the next currentDefKey = AES derived with secretCode2 + cumulativeNonce.
11)The receiver decrypts using currentDefKey, gets the AES and derivationNonce, updates cumulativeNonce exactly the same way (first message: =derivationNonce; later: SHA-256(old||new)[0:15]), then derives the next currentDefKey = AES derived with secretCode2 + cumulativeNonce.
*/
function app() {
    'use strict'
    console.log("Argon2:", typeof argon2 !== "undefined" ? "ok" : "error");
    const dynamicElements = document.getElementsByClassName("dynamic")
    let userName
    let tempKey
    let keyPair
    let roomName
    let joinerToken
    let hostToken
    let secretCode1
    let secretCode2
    let initKey
    let nonce
    let defKey
    let stopStepsAnimation = false
    let countdownInterval = null
    let countDownSeconds = 9
    let initKeyCrypto
    let cumulativeNonce = null
    let sendOk = false

    updateDynamicElements("landingPage")
    hostBtnStart.addEventListener("click", () => updateDynamicElements("hostPage"))
    joinBtnStart.addEventListener("click", () => updateDynamicElements("joinPage"))
    backButton.addEventListener("click", () => updateDynamicElements("landingPage"))
    hostBtnEnd.addEventListener("click", hostSetupAndRegisterARoom)
    joinBtnEnd.addEventListener("click", joinerSetupAndFindsRoom)
    reloadButton.addEventListener("click", () => { location.reload() })



    //--------------------------------------Design functions
    function updateDynamicElements(classToShow) {
        if (classToShow == "chatPage") {
            document.getElementById("centralSection").style.height = "60vh"
        }
        for (let i = 0; i < dynamicElements.length; i++) {
            if (!dynamicElements[i].classList.contains(classToShow)) {
                dynamicElements[i].style.display = "none";
            } else {
                dynamicElements[i].style.display = "";
            }
        }
    }

    function showBorderEffect(user, containerId) {
        let userClassName
        if (user == "host") {
            userClassName = ".hostPage.drawingSec"
        }
        else if (user == "joiner") {
            userClassName = ".joinPage.drawingSec"
        }
        let containerEffectClassName = containerId + "BorderEffect"
        let targetClass = userClassName + " ." + containerId //identify the element (img container)
        document.querySelector(targetClass).classList.add(containerEffectClassName)
    }

    function stepsAnimation(nextStep, user, result) {
        if (result == "completed" && stopStepsAnimation == false) {
            if (user == "host") {
                if (nextStep == "tempKey") {
                    document.getElementById("tempKeyHostLegend").textContent = "Working on it..."
                }
                if (nextStep == "initKey") {
                    document.getElementById("initKeyHostLegend").textContent = "Working on it..."
                    document.getElementById("tempKeyHostLegend").textContent = "TempKey, a symmetric AES-GCM key, successfully generated from the secret word 1 and using Argon2."
                    document.getElementById("tempKeyHostImg").classList.add("stepCompleted")
                }
                if (nextStep == "defKey") {
                    document.getElementById("defKeyHostLegend").textContent = "Working on it..."
                    document.getElementById("initKeyHostLegend").textContent = "initKey, a public assymetric RSA-OAEP key, was encrypted by tempKey and successfully sent to the server."
                    document.getElementById("initKeyHostImg").classList.add("stepCompleted")
                }
                if (nextStep == "validated") {
                    document.getElementById("lockStatusHostLegend").textContent = "Working on it..."
                    document.getElementById("defKeyHostLegend").textContent = "defKey, a symmetric AES-GCM key encrypted by initKey, was received and decrypted."
                    document.getElementById("defKeyHostImg").classList.add("stepCompleted")
                }
                if (nextStep == "chat") {
                    document.getElementById("lockStatusHostLegend").textContent = "The secret word 2 encrypted by defKey successfully sent to the server. If the joiner validates it, the chat starts."
                    document.getElementById("lockStatusHostImg").src = "./assets/locked.webp"
                }
            }
            else if (user == "joiner") {
                if (nextStep == "tempKey") {
                    document.getElementById("tempKeyJoinerLegend").textContent = "Working on it..."
                }
                if (nextStep == "initKey") {
                    document.getElementById("initKeyJoinerLegend").textContent = "Working on it..."
                    document.getElementById("tempKeyJoinerLegend").textContent = "TempKey, a symmetric AES-GCM key, successfully generated from the secret word 1 and using Argon2."
                    document.getElementById("tempKeyJoinerImg").classList.add("stepCompleted")
                }
                if (nextStep == "defKey") {
                    document.getElementById("defKeyJoinerLegend").textContent = "Working on it..."
                    document.getElementById("initKeyJoinerLegend").textContent = "initKey, the host public assymetric RSA-OAEP key encrypted by tempKey, was received and decrypted."
                    document.getElementById("initKeyJoinerImg").classList.add("stepCompleted")
                }
                if (nextStep == "validated") {
                    document.getElementById("lockStatusJoinerLegend").textContent = "Working on it..."
                    document.getElementById("defKeyJoinerLegend").textContent = "defKey, a symmetric AES-GCM key, was encrypted by initKey and sent to the server."
                    document.getElementById("defKeyJoinerImg").classList.add("stepCompleted")
                }
                if (nextStep == "chat") {
                    document.getElementById("lockStatusJoinerLegend").textContent = "The secret word 2 encrypted by defKey received and successfully validated. The chat can begin."
                    document.getElementById("lockStatusJoinerImg").src = "./assets/locked.webp"
                }
            }
        }
        else if (result == "failed") {
            stopStepsAnimation = true
            if (user == "host") {
                if (nextStep == "tempKey") {
                    document.getElementById("tempKeyJoinerLegend").textContent = "tempKey couldn't be generated."
                    document.getElementById("tempKeyJoinerImg").classList.add("stepFailed")
                }
                if (nextStep == "initKey") {
                    document.getElementById("initKeyHostLegend").textContent = "initKey couldn't be generated, encrypted or sent."
                    document.getElementById("initKeyHostImg").classList.add("stepFailed")
                }
                if (nextStep == "defKey") {
                    document.getElementById("defKeyHostLegend").textContent = "defKey couldn't be received or decrypted."
                    document.getElementById("defKeyHostImg").classList.add("stepFailed")
                }
                if (nextStep == "validated") {
                    document.getElementById("lockStatusHostLegend").textContent = "Secret couldn't be encrypted or sent."
                    document.getElementById("lockStatusJoinerImg").classList.add("stepFailed")
                }

            }
            else if (user == "joiner") {
                if (nextStep == "tempKey") {
                    document.getElementById("tempKeyJoinerLegend").textContent = "tempKey couldn't be generated."
                    document.getElementById("tempKeyJoinerImg").classList.add("stepFailed")
                }
                if (nextStep == "initKey") {
                    document.getElementById("initKeyJoinerLegend").textContent = "initKey couldn't be received or decrypted. Is the secretCode1 right?"
                    document.getElementById("initKeyJoinerImg").classList.add("stepFailed")
                }
                if (nextStep == "defKey") {
                    document.getElementById("defKeyJoinerLegend").textContent = "defKey couldn't be generated, encrypted or sent."
                    document.getElementById("defKeyJoinerImg").classList.add("stepFailed")
                }
                if (nextStep == "validated") {
                    document.getElementById("lockStatusJoinerLegend").textContent = "Secret couldn't be received or decrypted."
                    document.getElementById("lockStatusJoinerImg").classList.add("stepFailed")
                }
                if (nextStep == "chat") {
                    document.getElementById("lockStatusJoinerLegend").textContent = "The host is not verified. He sent a wrong secret code 2."
                    document.getElementById("lockStatusJoinerImg").classList.add("stepFailed")
                }
            }

        }
    }


    //--------------------------------Functional functions (keyExchange)
    function timer(user, action) {
        if (action == "start" && countdownInterval || action == "stop" && countdownInterval == null) {
            return
        }
        else {
            if (user == "host" && action == "start") {
                const countdownP = document.getElementById("destroyChatHostP")
                const destroyLegend = document.getElementById("destroyChatHostLegend")
                let destroyLegendMsg = "For security reasons, the deadline to get a defKey (blue) is: "
                destroyLegend.textContent = destroyLegendMsg + countDownSeconds
                countdownInterval = setInterval(() => {
                    countDownSeconds--
                    countdownP.textContent = countDownSeconds
                    destroyLegend.textContent = destroyLegendMsg + countDownSeconds
                    if (countDownSeconds == 0) {
                        clearInterval(countdownInterval);
                        countdownInterval = null;
                        alert("InitKey could be compromised, please host a new room.")
                        deleteRoom()
                        setTimeout(() => {
                            location.reload()
                        }, 1000);
                    }
                }, 1000);
            }
            if (user == "joiner" && action == "start") {
                const countdownP = document.getElementById("destroyChatJoinerP")
                const destroyLegend = document.getElementById("destroyChatJoinerLegend")
                let destroyLegendMsg = "The deadline to get a defKey (blue) is: "
                destroyLegend.textContent = destroyLegendMsg + countDownSeconds
                countdownInterval = setInterval(() => {
                    countDownSeconds--
                    countdownP.textContent = countDownSeconds
                    destroyLegend.textContent = destroyLegendMsg + countDownSeconds
                    if (countDownSeconds == 0) {
                        clearInterval(countdownInterval);
                        countdownInterval = null;
                        alert("Something's off... please join another room.")
                    }
                }, 1000);
            }
            if (action === "stop") {
                let destroyLegend
                let countdownP
                let targetId = "#" + user + "DestroyChatDrawingContainer .destroyChatImgContainer" //identify the element (img container)
                document.querySelector(targetId).classList.add("stepCompleted")
                if (user == "host") {
                    destroyLegend = document.getElementById("destroyChatHostLegend")
                    countdownP = document.getElementById("destroyChatHostP")
                }
                else if (user == "joiner") {
                    destroyLegend = document.getElementById("destroyChatJoinerLegend")
                    countdownP = document.getElementById("destroyChatJoinerP")
                }
                clearInterval(countdownInterval);
                countdownInterval = null;
                destroyLegend.textContent = "Self-destruct deactivated: time check passed."
                countdownP.textContent = ""

            }
        }
    }

    //1)The host generates a nonce, the tempKey (using secretCode1 and Argon), the initKey (public RSA-OAEP) then he registers a room with the roomName and receives the hostToken.
    function hostSetupAndRegisterARoom() {
        if (roomNameInput.value.trim().length == 0) {
            alert("Missing room name")
            return
        }
        else if (roomSecretCodeInput1.value.trim().length == 0) {
            alert("Missing room SecretCode1")
            return
        }
        else if (roomSecretCodeInput2.value.trim().length == 0) {
            alert("Missing room SecretCode2")
            return
        }
        else {
            roomName = roomNameInput.value
            document.getElementById("roomNameH2").textContent = roomName
            secretCode1 = roomSecretCodeInput1.value
            secretCode2 = roomSecretCodeInput2.value
            stepsAnimation("tempKey", "host", "completed")
            hostGeneratesNonce()
            hostGeneratesTempKey()
            hostGeneratesInitKey()
            hostRegistersRoom()
        }
    }



    async function hostGeneratesTempKey() {
        try {
            // Password into buffer (UTF-8)
            const passwordBuffer = new TextEncoder().encode(secretCode1);
            // Argon2 parameters
            const argon2Params = {
                pass: passwordBuffer,           // Uint8Array: UTF-8 encoded password (secret input)
                salt: nonce,                    // Uint8Array: 16+ byte random salt (unique per derivation, prevents rainbow tables)
                time: 3,                        // Integer: iterations (cost factor); 3 = ~0.5–1s in browser (1–5 safe, >5 risks UI freeze)
                mem: 32768,                     // Integer (KiB): memory usage; 32768 KiB = 32 MiB (safe range: 8–64 MiB, avoid >64 MiB)
                hashLen: 32,                    // Integer (bytes): output key length; 32 = 256-bit key for AES-256
                parallelism: 1,                 // Integer: lanes/threads; MUST be 1 in browser (multi-threading unsupported & causes OOM/crash)
                type: argon2.Argon2id,          // Enum: Argon2id = hybrid (GPU + side-channel resistant) – recommended standard
            };
            // Derivate the key using Argon2
            const hash = await argon2.hash(argon2Params);
            // Derivated hash into a CryptoKey per AES-GCM
            const key = await crypto.subtle.importKey(
                'raw',
                hash.hash, // Buffer that contains the derivated key (32 byte)
                { name: 'AES-GCM' },
                false, // Not extraible
                ['encrypt', 'decrypt']
            );
            tempKey = key
        } catch (error) {
            console.error(error);
            stepsAnimation("tempKey", "host", "failed")
            throw error;
        }
    }

    function hostGeneratesNonce() {
        nonce = crypto.getRandomValues(new Uint8Array(16));
    }

    async function hostGeneratesInitKey() {
        try {
            keyPair = await crypto.subtle.generateKey(
                {
                    name: "RSA-OAEP", // Algorithm
                    modulusLength: 4096, // Key length in bits
                    publicExponent: new Uint8Array([1, 0, 1]), // Public exponent (65537)
                    hash: "SHA-256", // Hash algorithm
                },
                false, // Non-extractable (applies to private key)
                ["encrypt", "decrypt"] // Key usages
            );
            initKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
        } catch (error) {
            console.error("initKey generation error:", error);
            stepsAnimation("initKey", "host", "failed")
            return null;
        }
    }

    function hostRegistersRoom() {
        const payload = {
            roomName,
        };
        fetch('http://localhost:3001/api/hostRegistersRoom', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(res => {
                if (res.status === 400) {
                    alert("Impossible to create the room");
                    throw new Error("Bad request");
                }
                return res.json();
            })
            .then(data => {
                hostToken = data.hostToken;
                userName = "host";
                hostAsksForJoiner();
            })
            .catch(err => console.error(err));
    }



    //2)The host asks each 1,5s if the other user (joiner) joined the room.
    function hostAsksForJoiner() {
        fetch('http://localhost:3001/api/hostAsksForJoiner', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                roomName: roomName,
                hostToken: hostToken
            })
        })
            .then(response => {
                if (response.status === 404) {
                    setTimeout(() => {
                        hostAsksForJoiner();
                    }, 1500);
                    return;
                }
                if (!response.ok) {
                    return;
                }
                return response.json().then(data => {
                    hostEncryptsInitKey();
                });
            })
            .catch(error => console.error('Errore:', error));
    }


    //3)The joiner generates the defKey (AES), joins the room (with roomName) and receives the joinerToken.
    function joinerSetupAndFindsRoom() {
        if (roomNameInput.value.trim().length == 0) {
            alert("Missing room name")
            return
        }
        else if (roomSecretCodeInput1.value.trim().length == 0) {
            alert("Missing room SecretCode1")
            return
        }
        else if (roomSecretCodeInput2.value.trim().length == 0) {
            alert("Missing room SecretCode2")
            return
        }
        else {
            roomName = roomNameInput.value
            document.getElementById("roomNameH2").textContent = roomName
            secretCode1 = roomSecretCodeInput1.value
            secretCode2 = roomSecretCodeInput2.value
            stepsAnimation("tempKey", "joiner", "completed")
            joinerGeneratesDefKey()
            joinerFindsRoom()
        }
    }

    async function joinerGeneratesDefKey() {
        try {
            const key = await crypto.subtle.generateKey(
                {
                    name: 'AES-GCM',
                    length: 256,
                },
                true, //Extraible
                ['encrypt', 'decrypt']
            );
            defKey = key
        } catch (error) {
            console.error('Errore nella generazione della chiave:', error);
            stepsAnimation("defKey", "joiner", "failed")

            throw error;
        }
    }

    function joinerFindsRoom() {
        fetch('http://localhost:3001/api/joinerFindsRoom', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                roomName: roomName
            })
        })
            .then(response => {
                if (response.status === 404) {
                    alert("Room not found");
                    throw new Error("Room not found");
                }
                return response.json();
            })
            .then(data => {
                joinerToken = data.joinerToken;
                userName = "joiner";
                joinerAsksForEncryptedInitKeyAndNonce();
            })
            .catch(error => console.error(error));
    }

    function base64NonceIntoUint8Array(base64Nonce) {
        // Step 1: Decode base64 to a binary string
        const binaryString = atob(base64Nonce);
        // Step 2: Convert binary string to ArrayBuffer
        const buffer = new ArrayBuffer(binaryString.length);
        const view = new Uint8Array(buffer);
        for (let i = 0; i < binaryString.length; i++) {
            view[i] = binaryString.charCodeAt(i);
        }
        // Step 3: save the Uint8Array nonce
        nonce = view
    }

    async function joinerGeneratesTempKey() {
        try {
            // Password into buffer (UTF-8)
            const passwordBuffer = new TextEncoder().encode(secretCode1);
            // Argon2 parameters
            const argon2Params = {
                pass: passwordBuffer,           // Uint8Array: UTF-8 encoded password (secret input)
                salt: nonce,                    // Uint8Array: 16+ byte random salt (unique per derivation, prevents rainbow tables)
                time: 3,                        // Integer: iterations (cost factor); 3 = ~0.5–1s in browser (1–5 safe, >5 risks UI freeze)
                mem: 32768,                     // Integer (KiB): memory usage; 32768 KiB = 32 MiB (safe range: 8–64 MiB, avoid >64 MiB)
                hashLen: 32,                    // Integer (bytes): output key length; 32 = 256-bit key for AES-256
                parallelism: 1,                 // Integer: lanes/threads; MUST be 1 in browser (multi-threading unsupported & causes OOM/crash)
                type: argon2.Argon2id,          // Enum: Argon2id = hybrid (GPU + side-channel resistant) – recommended standard
            };
            // Derivate the key using Argon2
            const hash = await argon2.hash(argon2Params);
            // Derivated hash into a CryptoKey per AES-GCM
            const key = await crypto.subtle.importKey(
                'raw',
                hash.hash, // Buffer that contains the derivated key (32 byte)
                { name: 'AES-GCM' },
                false, // Not extraible
                ['encrypt', 'decrypt']
            );
            tempKey = key
        } catch (error) {
            stepsAnimation("tempKey", "joiner", "failed")
            console.error(error);
            throw error;
        }
    }



    //4)The host, knowing the joiner is present, generates a self-destruct timer and sends the initKey encrypted by the tempKey and the nonce to the server.
    async function hostEncryptsInitKey() {
        try {
            stepsAnimation("initKey", "host", "completed")
            const initKeyJSON = JSON.stringify(initKey);
            const encoder = new TextEncoder();
            const data = encoder.encode(initKeyJSON);
            const nonce = crypto.getRandomValues(new Uint8Array(12));
            const encrypted = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: nonce },
                tempKey,
                data
            );
            const result = new Uint8Array(nonce.byteLength + encrypted.byteLength);
            result.set(nonce, 0);
            result.set(new Uint8Array(encrypted), nonce.byteLength);
            const base64 = btoa(String.fromCharCode(...result));
            showBorderEffect("host", "initKeyImgContainer")

            hostSendsEncryptedInitKeyAndNonce(base64);
        } catch (error) {
            console.error("Errore crittografia initKey:", error);
            stepsAnimation("initKey", "host", "failed")
        }
    }
    async function hostSendsEncryptedInitKeyAndNonce(encryptedInitKey) {
        timer("host", "start")
        fetch('http://localhost:3001/api/hostSendsEncryptedInitKeyAndNonce', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                roomName: roomName,
                hostToken: hostToken,
                encryptedInitKey: encryptedInitKey,
                nonce: btoa(String.fromCharCode(...nonce))
            })
        })
            .then(response => response.json())
            .then(data => {
                stepsAnimation("defKey", "host", "completed")
                hostAsksForEncryptedDefKey()
            })
            .catch(error => {
                console.error('Error:', error)
                stepsAnimation("initKey", "host", "failed")
            })
    }


    //5)The joiner asks for the nonce and encrypted initKey. Then he generates the tempKey (secretCode1, nonce and Argon) and uses it to decrypt the initKey
    function joinerAsksForEncryptedInitKeyAndNonce() {
        stepsAnimation("initKey", "joiner", "completed")
        fetch('http://localhost:3001/api/joinerAsksForEncryptedInitKeyAndNonce', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                roomName: roomName,
                joinerToken: joinerToken
            })
        })
            .then(response => {
                return response.json().then(data => {
                    if (response.status === 404) {//initKey not ready
                        setTimeout(() => {
                            joinerAsksForEncryptedInitKeyAndNonce()
                        }, 1500);
                        return;
                    }
                    if (!response.ok) {
                        return;
                    }
                    async function handleData(data) {
                        base64NonceIntoUint8Array(data.nonce); // the host will use the Uint8Array nonce to make his tempKey
                        await joinerGeneratesTempKey();
                        await joinerDecryptsInitKey(data.encryptedInitKey)
                        showBorderEffect("joiner", "initKeyImgContainer")
                    }
                    handleData(data)
                });
            })
            .catch(error => {
                console.error('Errore:', error)
                stepsAnimation("initKey", "joiner", "failed")
            });
    }


    async function joinerDecryptsInitKey(base64Encrypted) {
        try {
            // Decode base64 to get nonce + ciphertext
            const encryptedWithNonce = Uint8Array.from(atob(base64Encrypted), c => c.charCodeAt(0));
            // Extract the nonce (first 12 bytes) and ciphertext (remaining bytes)
            const nonce = encryptedWithNonce.slice(0, 12); // First 12 bytes are the nonce
            const ciphertext = encryptedWithNonce.slice(12); // Rest is the ciphertext
            // Decrypt using the correct nonce and tempKey
            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: nonce },
                tempKey,
                ciphertext
            );
            // Parse the decrypted data
            const initKeyJWK = JSON.parse(new TextDecoder().decode(decrypted));
            // Import the initKey as a CryptoKey
            initKeyCrypto = await crypto.subtle.importKey(
                'jwk',
                initKeyJWK,
                { name: 'RSA-OAEP', hash: 'SHA-256' },
                false,
                ['encrypt']
            );
            joinerEncryptsAndSendsDefKey();
        } catch (error) {
            stepsAnimation("initKey", "joiner", "failed")

            console.error("Errore decriptazione initKey:", error);
            throw error;
        }
    }


    // 6) The joiner starts a self-destruct timer, encrypts the defKey + random nonce using the decrypted initKey and sends it to the server.
    async function joinerEncryptsAndSendsDefKey() {
        try {
            stepsAnimation("defKey", "joiner", "completed");
            // Export defKey as raw (ArrayBuffer)
            const defKeyRaw = await crypto.subtle.exportKey('raw', defKey);
            // Generate a secure random nonce (16 bytes = 128 bits)
            const nonce = crypto.getRandomValues(new Uint8Array(16));
            // Concatenate defKey + nonce
            const defKeyWithNonce = new Uint8Array(defKeyRaw.byteLength + nonce.byteLength);
            defKeyWithNonce.set(new Uint8Array(defKeyRaw), 0);
            defKeyWithNonce.set(nonce, defKeyRaw.byteLength);
            // Encrypt the combined buffer with RSA-OAEP
            const encrypted = await crypto.subtle.encrypt(
                { name: 'RSA-OAEP' },
                initKeyCrypto,
                defKeyWithNonce
            );
            // Convert to base64
            const base64EncryptedDefKey = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
            showBorderEffect("joiner", "defKeyImgContainer");
            // Send to server
            await fetch('http://localhost:3001/api/joinerSendsEncryptedDefKey', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomName,
                    joinerToken,
                    encryptedDefKey: base64EncryptedDefKey,
                })
            });
            timer("joiner", "start");
            joinerAsksForEncryptedSecret();
        } catch (error) {
            console.error("Error encrypting defKey:", error);
            stepsAnimation("defKey", "joiner", "failed");
        }
    }



    /* 7) The host polls every 1.5 s for the defKey encrypted by the initKey. When it arrives it is decrypted, the trailing 16-byte nonce is removed, and the clean defKey is imported. The self-destruct timer is cleared.*/
    function hostAsksForEncryptedDefKey() {
        fetch('http://localhost:3001/api/hostAsksForEncryptedDefKey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                roomName: roomName,
                hostToken: hostToken
            })
        })
            .then(response => {
                if (response.status === 404) {
                    return response.json().then(data => {
                        console.log(data.error); // "defKey not ready"
                        setTimeout(hostAsksForEncryptedDefKey, 1500);
                    });
                }
                if (!response.ok) {
                    stepsAnimation("defKey", "host", "failed");
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                hostDecryptsDefKey(data.encryptedDefKey);
                showBorderEffect("host", "defKeyImgContainer");
            })
            .catch(error => {
                console.error('Error requesting defKey:', error);
            });
    }

    // Decrypt the ciphertext, strip the trailing 16-byte nonce and import the AES key.
    async function hostDecryptsDefKey(base64EncryptedDefKey) {
        try {
            // 1. base64 → Uint8Array
            const encryptedData = Uint8Array.from(
                atob(base64EncryptedDefKey),
                c => c.charCodeAt(0)
            );
            // 2. RSA-OAEP decryption (returns defKey || nonce)
            const decryptedWithNonce = await crypto.subtle.decrypt(
                { name: 'RSA-OAEP' },
                keyPair.privateKey,
                encryptedData
            );
            // 3. Convert to Uint8Array and drop the last 16 bytes
            const fullArray = new Uint8Array(decryptedWithNonce);
            const NONCE_LENGTH = 16;
            if (fullArray.byteLength <= NONCE_LENGTH) {
                throw new Error('Decrypted payload too short – missing nonce');
            }
            const defKeyRaw = fullArray.slice(0, -NONCE_LENGTH);
            defKey = await crypto.subtle.importKey(
                'raw',
                defKeyRaw,
                { name: 'AES-GCM' },
                false,
                ['encrypt', 'decrypt']
            );
            timer("host", "stop");
            hostEncryptsTheSecret(defKey);
            stepsAnimation("validated", "host", "completed");
        } catch (error) {
            console.error('Decryption/import error:', error);
            stepsAnimation("defKey", "host", "failed");
        }
    }

    //8)The host Encrypts the hash of secretCode2 using the defKey and sends it to the server.
    async function hostEncryptsTheSecret() {
        try {
            if (!defKey) {
                console.error("defKey non disponibile. Attendere...");
                return;
            }
            // Convert secret (string) to ArrayBuffer
            const encoder = new TextEncoder();
            const dataToHash = encoder.encode(secretCode2);
            //Hash
            const hashBuffer = await crypto.subtle.digest('SHA-256', dataToHash);
            const secretToEncrypt = new Uint8Array(hashBuffer)
            const nonce = crypto.getRandomValues(new Uint8Array(12));
            // Encrypt with defKey (AES-GCM)
            const encrypted = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: nonce },
                defKey,
                secretToEncrypt
            );
            // Concatenate nonce + ciphertext
            const result = new Uint8Array(nonce.byteLength + encrypted.byteLength);
            result.set(nonce, 0);
            result.set(new Uint8Array(encrypted), nonce.byteLength);
            // Convert to base64 for sending
            const base64EncryptedHash = btoa(String.fromCharCode(...result));
            showBorderEffect("host", "lockStatusImgContainer")
            hostSendsEncryptedSecret(base64EncryptedHash);
        } catch (error) {
            stepsAnimation("validated", "host", "failed")
            console.error("Errore crittografia secret:", error);
        }
    }


    function hostSendsEncryptedSecret(base64EncryptedHash) {
        currentDefKey = defKey;
        defKey = null
        fetch('http://localhost:3001/api/hostSendsEncryptedSecret', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                roomName: roomName,
                hostToken: hostToken,
                encryptedSecret: base64EncryptedHash
            })
        })
            .then(response => response.json())
            .then(data => {
                stepsAnimation("chat", "host", "completed")
                setTimeout(() => {
                    updateDynamicElements("chatPage")
                    if (!hostGetsMsgInterval) {
                        hostGetsMsgInterval = setInterval(hostAsksForMessage, 1000);
                    }
                }, 1000);
            })
            .catch(error => {
                stepsAnimation("validated", "host", "failed")

            });
    }
    //9)The joiner ask for the encrypted hash of SecretCode2, decrypts it, compares it. If matches, the processus is validated and the joiner timer cleared.
    async function joinerAsksForEncryptedSecret() {
        try {
            stepsAnimation("validated", "joiner", "completed")
            const response = await fetch('http://localhost:3001/api/joinerAsksForEncryptedSecret', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    roomName: roomName,
                    joinerToken: joinerToken
                })
            });
            if (response.status === 404) { //encrypted secret is not ready
                setTimeout(() => {
                    joinerAsksForEncryptedSecret()
                }, 1500);
                return;
            }
            const data = await response.json();
            if (!data.encryptedSecret) {
                throw new Error("Encrypted secret not found in server response");
            }
            showBorderEffect("joiner", "lockStatusImgContainer")

            joinerDecryptsTheSecret(data.encryptedSecret)
        } catch (error) {
            stepsAnimation("validated", "joiner", "failed")
        }
    }


    async function joinerDecryptsTheSecret(base64EncryptedSecret) {
        try {
            // Decode base64 to get nonce + ciphertext
            const encryptedWithNonce = Uint8Array.from(atob(base64EncryptedSecret), c => c.charCodeAt(0));
            // Extract nonce (first 12 bytes) and ciphertext (remaining bytes)
            const nonce = encryptedWithNonce.slice(0, 12);
            const ciphertext = encryptedWithNonce.slice(12);
            // Decrypt using defKey and the extracted nonce
            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: nonce },
                defKey,
                ciphertext
            );
            const receivedSecretHash = new Uint8Array(decrypted)
            joinerValidatesTheHost(receivedSecretHash)
        } catch (error) {
            stepsAnimation("validated", "joiner", "failed")
            throw error;
        }
    }

    async function joinerValidatesTheHost(receivedSecretHash) {
        const encoder = new TextEncoder();
        const myHashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(secretCode2));
        const myHash = new Uint8Array(myHashBuffer)
        const a = receivedSecretHash;
        const b = myHash;
        console.log(a, b)
        if (a.length === b.length && a.toString() === b.toString()) {
            stepsAnimation("chat", "joiner", "completed")
            timer("joiner", "stop")
            alert("host is certified!")
            currentDefKey = defKey
            defKey = null
            setTimeout(() => {
                updateDynamicElements("chatPage")
                if (!joinerGetsMsgInterval) {
                    joinerGetsMsgInterval = setInterval(joinerAsksForMessage, 1000);
                }
            }, 1000);
        } else {
            alert("host is not certified")
            deleteRoom()
            stepsAnimation("chat", "joiner", "failed")
            setTimeout(() => {
                location.reload()
            }, 1000);
        }
    }

    //--------------------------------Functional functions (chat part)

    let joinerGetsMsgInterval = null
    let hostGetsMsgInterval = null
    let currentDefKey = null


    document.getElementById("sendMsgBtn").addEventListener("click", encryptTheMessage)
    document.getElementById("destroyChatBtn").addEventListener("click", deleteRoom)
    document.getElementById("newWindowBtn").addEventListener("click", openNewWindow)


    function openNewWindow() {
        const url = location.href;
        window.open(url, '_blank');
    }


    async function hostAsksForMessage() {
        try {
            const response = await fetch('http://localhost:3001/api/hostAsksForMessage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomName, hostToken })
            });
            if (response.status === 404) {
                return;
            }
            if (response.status == "403") {
                alert("This chat is lost or deleted.")
                location.reload()
                return false
            }
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Errore server');
            }
            const encryptedMessages = await response.json();
            for (let i = 0; i < encryptedMessages.length; i++) {
                await decryptTheMessage(encryptedMessages[i].message)
            }
        } catch (error) {
            console.error("Errore recupero messaggio:", error);
            throw error;
        }
    }

    async function joinerAsksForMessage() {
        try {
            const response = await fetch('http://localhost:3001/api/joinerAsksForMessage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomName, joinerToken })
            });
            if (response.status == "403") {
                alert("This chat is lost or deleted.")
                location.reload()
                return false
            }
            if (response.status === 404) {
                return
            }
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Errore server');
            }
            const encryptedMessages = await response.json();
            for (let i = 0; i < encryptedMessages.length; i++) {
                await decryptTheMessage(encryptedMessages[i].message)
            }
        } catch (error) {
            console.error("Error:", error);
            throw error;
        }
    }

    async function hostSendsMessage(base64EncryptedMsg) {
        try {
            const response = await fetch('http://localhost:3001/api/hostSendsMessage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomName,
                    hostToken,
                    message: base64EncryptedMsg
                })
            });
            if (response.status == "403") {
                alert("This chat is lost or deleted.")
                location.reload()
                return false
            }
            if (response.status === 429) {
                alert("Too many pending messages, please wait...");
                return false;
            }
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Send failed');
            }
            const data = await response.json();
            sendOk = true
            let message = document.getElementById("messageInput").value;
            showMsg(message, "me");
            document.getElementById("messageInput").value = ""
            return true;

        } catch (error) {
            console.error("Error:", error);
            return false;
        }
    }

    async function joinerSendsMessage(base64EncryptedMsg) {
        try {
            const response = await fetch('http://localhost:3001/api/joinerSendsMessage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomName,
                    joinerToken,
                    message: base64EncryptedMsg
                })
            });
            if (response.status == "403") {
                alert("This chat is lost or deleted.")
                location.reload()
                return false
            }
            if (response.status === 429) {
                alert("Too many pending messages, please wait...");
                return false;
            }
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Send failed');
            }
            const data = await response.json();
            sendOk = true
            let message = document.getElementById("messageInput").value;
            showMsg(message, "me");
            document.getElementById("messageInput").value = ""
            return true;
        } catch (error) {
            console.error(error);
            return false;
        }
    }

    async function deriveNextCurrentDefKey(nextAesRaw) {
        // Build dynamic salt: secretCode2 + cumulative nonce (16 bytes)
        const secretBytes = new TextEncoder().encode(secretCode2)
        let salt = new Uint8Array(secretBytes.length + 16);
        salt.set(secretBytes)
        salt.set(cumulativeNonce, secretBytes.length)
        const hash = await argon2.hash({
            pass: nextAesRaw,
            salt: salt,
            time: 3,
            mem: 32768,
            hashLen: 32,
            parallelism: 1,
            type: argon2.Argon2id
        })
        const newKey = await crypto.subtle.importKey(
            "raw",
            hash.hash,
            { name: "AES-GCM" },
            false,
            ["encrypt", "decrypt"]
        )
        currentDefKey = newKey
        return currentDefKey
    }




    async function encryptTheMessage() {
        let message = document.getElementById("messageInput").value;
        if (message.trim() === "") {
            alert("The message is empty.");
            return;
        }
        try {
            // 1. Generate the next random AES key that will be derived (secretCode2 + cumulativeNonce) and used after this message
            const nextAesKey = await crypto.subtle.generateKey(
                { name: "AES-GCM", length: 256 },
                true,
                ["encrypt", "decrypt"]
            );
            const nextAesRaw = new Uint8Array(await crypto.subtle.exportKey("raw", nextAesKey));
            // 2. Generate a fresh derivation nonce (16 bytes) that will be cumulated and used (with secretCode2) to derive the key for the NEXT message
            const derivationNonce = crypto.getRandomValues(new Uint8Array(16));
            // 3. Build the payload: message || nextAesKey (32) || derivationNonce (16)
            const encoder = new TextEncoder();
            const msgData = encoder.encode(message);
            const payload = new Uint8Array(msgData.byteLength + 32 + 16);
            payload.set(msgData, 0);
            payload.set(nextAesRaw, msgData.byteLength);
            payload.set(derivationNonce, msgData.byteLength + 32);
            // 4. Standard AES-GCM IV (still sent in clear – required by the algorithm)
            const iv = crypto.getRandomValues(new Uint8Array(12));
            // 5. Encrypt everything with the current key
            const encrypted = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv },
                currentDefKey,
                payload
            );
            // 6. Prepend IV and convert to base64
            const result = new Uint8Array(iv.byteLength + encrypted.byteLength);
            result.set(iv, 0);
            result.set(new Uint8Array(encrypted), iv.byteLength);
            const base64EncryptedMsg = btoa(String.fromCharCode(...result));

            // 7. Send message
            if (userName === "host") {
                await hostSendsMessage(base64EncryptedMsg);
            } else {
                await joinerSendsMessage(base64EncryptedMsg);
            }
            // 8. Save the derivation nonce for the next key derivation if the server saved the msg
            if (sendOk) {
                sendOk = false
                if (!cumulativeNonce || cumulativeNonce.byteLength === 0) {
                    // first message
                    cumulativeNonce = derivationNonce
                } else {
                    // others messages
                    const combined = new Uint8Array(32);
                    combined.set(cumulativeNonce, 0);
                    combined.set(derivationNonce, 16);
                    const hash = await crypto.subtle.digest("SHA-256", combined);
                    cumulativeNonce = hash.slice(0, 16);  // always 16 byte
                }
                // 9. Derive the new current key from the nextAesKey (using secretCode2 + derivationNonce from previous msg)
                currentDefKey = await deriveNextCurrentDefKey(nextAesRaw);
            }
        } catch (error) {
            console.error("Encryption failed:", error);
            alert("Failed to send message");
        }
    }

    async function decryptTheMessage(base64EncryptedMsg) {
        try {
            // 1. Decode base64 → IV (12) + ciphertext
            const encryptedWithIv = Uint8Array.from(atob(base64EncryptedMsg), c => c.charCodeAt(0));
            const iv = encryptedWithIv.slice(0, 12);
            const ciphertext = encryptedWithIv.slice(12);
            // 2. Decrypt with current key
            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                currentDefKey,
                ciphertext
            );
            const full = new Uint8Array(decrypted);
            /* 3. Extract parts:
                - message (variable length)
                - nextAesKey raw (32 bytes)
                - derivation nonce for the NEXT key (12 bytes) 
            */
            const totalFixed = 32 + 16;                         // 48 bytes fixed at the end
            const msgLength = full.byteLength - totalFixed;
            if (msgLength < 0) throw new Error("Corrupted payload");
            const msgBytes = full.slice(0, msgLength);
            const nextAesRaw = full.slice(msgLength, msgLength + 32);
            const derivationNonce = full.slice(msgLength + 32);
            // 4. Show message
            const msg = new TextDecoder().decode(msgBytes);
            showMsg(msg, "partner");
            // 5. Save the derivation nonce (was encrypted in the previous message)
            if (!cumulativeNonce || cumulativeNonce.byteLength === 0) {//this is the first message
                cumulativeNonce = derivationNonce
            } else { //if not the first message, cumulativeNonce depends on all previous derivationNonces
                const combined = new Uint8Array(32);
                combined.set(cumulativeNonce, 0);
                combined.set(derivationNonce, 16);
                const hash = await crypto.subtle.digest("SHA-256", combined);
                cumulativeNonce = hash.slice(0, 16);  // always 16 byte
            }
            // 6. Derive the next currentDefKey using the new cumulativeNonce
            currentDefKey = await deriveNextCurrentDefKey(nextAesRaw);
        } catch (error) {
            console.error("Decryption failed:", error);
            alert("Message corrupted or out of order");
        }
    }

    function showMsg(message, user) {
        const ul = document.getElementById('ulChat');
        const li = document.createElement('li');
        li.textContent = message;
        if (user == "partner") {
            li.style.color = "red"
            li.style.textShadow = "1px 1px white"
            li.style.fontSize = "larger"
            ul.appendChild(li);
        }
        else if (user == "me") {
            li.style.color = "green"
            li.style.textShadow = "1px 1px white"
            li.style.fontSize = "larger"
            ul.appendChild(li);
        }
    }

    async function deleteRoom() {
        let token
        if (userName == "host") {
            token = hostToken
        } else if (userName == "joiner") {
            token = joinerToken
        }
        try {
            const res = await fetch('http://localhost:3001/api/deleteRoom', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, roomName })
            });
            if (res.status == "403") {
                alert("This chat is lost or deleted.")
                location.reload()
                return
            }
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error);
            }
            return true;
        } catch (error) {
            alert("Delete failed:", error);
            return false;
        }
    }
}
app()