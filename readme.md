
# Chat SDX

Experimental, minimalist end-to-end encrypted chat.

Requires one **temporarily secure external channel** (voice call, QR, meeting, another app etc.) just to exchange two secret words and start the session. 
The countdown and user verification systems are designed to prevent the chat from starting if any attempt at compromise is detected. 
The system prioritizes anonymity and only collects information necessary for operation, ensuring that sensitive data does not pass through the server in plain text.

Every message uses a **unique key** derived via Argon2id using:
- a fresh random AES key (sent encrypted in the current message)
- a salt composed of **secret word 2 and the hash-chain of the present and all previous random derivation nonces**
* The first message is encrypted with the defKey derived via Argon2id using secret word 2 and the nonce of EIK (step 6 or 7)


## Security
1. **Chat will not start if**:
   - EIK is bruteforced (1)
   - EIK is replaced (2)
   - EDK is replaced (3)

2. **Chat starts safely if**:
   - EIK is stored and bruteforced later
   - Secure channel is compromised later

3. **Other**:
   -Only local variables to store information client-side.
   -Each message encrypted with a unique key derived using SC2 and cumulativeNonce: it depends on all previous derivationNonces.
   -It’s suggested to host it through Tor.
   -Only the last 3 messages are kept on the server
   -The room auto-deletes after 6 hours if no one sends a message
   -The fields `nonce`, `encryptedInitKey`, `encryptedDefKey`, and `encryptedSecret` are automatically deleted 12 seconds after the joiner enters the room
   -Both participants can delete the room at any time

   ## Frontend

-The steps:
1)The host generates a nonce, the tempKey (using secretCode1 and Argon), the initKey (public RSA-OAEP) then he registers a room with the roomName and receives the hostToken.
2)The host asks each 1,5s if the other user (joiner) joined the room.
3)The joiner generates the defKey (AES), joins the room (with roomName) and receives the joinerToken.
4)The host, knowing the joiner is present, generates a self-destruct timer and sends the initKey encrypted by the tempKey and the nonce to the server.
5)The joiner asks for the nonce and encrypted initKey. Then he generates the tempKey (secretCode1, nonce and Argon) and uses it to decrypt the initKey.
6)The joiner starts a self-destruct timer, encrypts the defKey + random nonce using the decrypted initKey and sends it to the server. The first currentKey is the defKey derived with this nonce and the secretCode2.
7)The host polls every 1.5 s for the defKey encrypted by the initKey. When it arrives it is decrypted, the trailing 16-byte nonce is used with the secretCode2 to derivate the first currentKey, and the clean defKey is imported. The self-destruct timer is cleared.
8)The host Encrypts the hash of secretCode2 using the defKey and sends it to the server.
9)The joiner ask for the encrypted hash of SecretCode2, decrypts it, compares it. If matches, the processus is validated and the joiner timer cleared.
----the chat starts---
-The first message is encrypted with defKey derived with the nonce (step 6 or 7) and the secretCode2. Then:
10)The sender encrypts message + a fresh AES + a nonce (derivationNonce) using currentDefKey (defKey for the first time) and sends it. Then updates cumulativeNonce (first message: =derivationNonce; later: SHA-256(old||new)[0:15]) and derives the next currentDefKey = AES derived with secretCode2 + cumulativeNonce.
11)The receiver decrypts using currentDefKey, gets the AES and derivationNonce, updates cumulativeNonce exactly the same way (first message: =derivationNonce; later: SHA-256(old||new)[0:15]), then derives the next currentDefKey = AES derived with secretCode2 + cumulativeNonce.

 


   ## Backend
 /*-----NAME-------------------------------------------INPUT------------------------------------OUTPUT--------
  STEP 1: hostRegistersRoom()                         roomName                                 hostToken
  STEP 2: joinerFindsRoom()                           roomName                                 joinerToken 
  STEP 3: hostAsksForJoiner()                         roomName, hostToken                      ------
  STEP 4: hostSendsEncryptedInitKeyAndNonce()         roomName, hostToken en. initKey, nonce   ------
  STEP 5: joinerAsksForEncryptedInitKeyAndNonce()     roomName, joinerToken                    en. initKey
  STEP 6: joinerSendsEncryptedDefKey()                roomName, joinerToken, en. defKey        ------
  STEP 7: hostAsksForEncryptedDefKey()                roomName, hostToken                      en. defKey
  STEP 8: hostSendsEncryptedSecret()                  roomName, hostToken, en. hashed secret   -------
  STEP 9: joinerAsksForEncryptedSecret()              roomName, joinerToken                    en. hashed secret
  -------------------------------------------CHAT STARTS----------------------------------------------------
  Message structure: currentDefKey { message || nextAesKey || derivationNonce(16) } 


  *cumulativeNonce= hash-chain of all previous derivationNonces (always 16 B)
  *currentDefKey= Argon2id(nextAesKey, secretCode2 + cumulativeNonce)




## Run (Frontend)
index.html

## Run (Backend)
```bash
cd back
npm i
npm start
