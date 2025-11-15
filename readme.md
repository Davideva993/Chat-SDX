
# Chat SDX
End-to-end encrypted minimalist chat that needs a **temporarily secure external channel** to enable **zero trust from the start** — chat fails to launch if compromised.
The **temporarily secure external channel** should not be compromised until the chat starts.



## Security
1. **Chat will not start if**:
   - EIK is bruteforced (1)
   - EIK is replaced (2)
   - EDK is replaced (3)

2. **Chat starts safely if**:
   - EIK is stored and bruteforced later
   - Secure channel is compromised later

3. **Other**:
   - Only local variables client-side
   - TOR between client and server

   ## Frontend
1)The host generates a nonce, the tempKey (using secretCode1 and Argon), the initKey (public RSA-OAEP) then he registers a room with the roomName and receives the hostToken.
2)The host asks each 1,5s if the other user (joiner) joined the room.
3)The joiner generates the defKey (AES), joins the room (with roomName) and receives the joinerToken.
4)The host, knowing the joiner is present, generates a self-destruct timer and sends the initKey encrypted by the tempKey and the nonce to the server.
5)The joiner asks for the nonce and encrypted initKey. Then he generates the tempKey (secretCode1, nonce and Argon) and uses it to decrypt the initKey
6)The joiner starts a self-destruct timer, encrypts the defKey + random nonce using the decrypted initKey and sends it to the server.
7)The host polls every 1.5 s for the defKey encrypted by the initKey. When it arrives it is decrypted, the trailing 16-byte nonce is removed, and the clean defKey is imported. The self-destruct timer is cleared.
8)The host Encrypts the secretCode2 using the defKey and sends it to the server.
9)The joiner ask for the encrypted SecretCode2, decrypts it, compares it. If matches, the processus is validated and the joiner timer cleared.


   ## Backend
 /*-----NAME-------------------------------------------INPUT------------------------------------OUTPUT--------
  STEP 1: hostRegistersRoom()                         roomName                                 hostToken
  STEP 2: joinerFindsRoom()                           roomName                                 joinerToken 
  STEP 3: hostAsksForJoiner()                         roomName, hostToken                      ------
  STEP 4: hostSendsEncryptedInitKeyAndNonce()         roomName, hostToken en. initKey, nonce   ------
  STEP 5: joinerAsksForEncryptedInitKeyAndNonce()             roomName, joinerToken                    en. initKey
  STEP 6: joinerSendsEncryptedDefKey()                roomName, joinerToken, en. defKey        ------
  STEP 7: hostAsksForEncryptedDefKey()                roomName, hostToken                      en. defKey
  STEP 8: hostSendsEncryptedSecret()                  roomName, hostToken, en. secret          -------
  STEP 9: joinerAsksForEncryptedSecret()              roomName, joinerToken                    en. secret
  -------------------------------------------CHAT STARTS----------------------------------------------------



## Run (Backend)
```bash
cd back
npm i
npm start