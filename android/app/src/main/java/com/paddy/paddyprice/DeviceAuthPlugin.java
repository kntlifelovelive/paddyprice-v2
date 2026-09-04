package com.paddy.paddyprice;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.X509EncodedKeySpec;

/**
 * Device authorization plugin (Phase 2).
 *
 * Creates a NON-EXPORTABLE EC P-256 key pair inside the Android Keystore and
 * runs a small LOOPBACK-ONLY activation server reached exclusively through
 * `adb forward tcp:<port> tcp:<port>` from the Linux installer.
 *
 * Security model:
 *  - The private device key never leaves the Keystore (signing happens inside).
 *  - The Linux installer signs the device public-key fingerprint with a master
 *    key whose PRIVATE half stays on the Linux machine (protected by
 *    keypass.txt). Only the master PUBLIC key ships in the APK
 *    (`assets/master_pub.b64`) — a verification root, not a secret.
 *  - No identifier (ANDROID_ID / serial / MAC) is used; identity is purely
 *    cryptographic.
 *
 * Ported faithfully from the reference project's DeviceAuthPlugin.java (§6.4).
 * Only port adaptation: `android.util.Base64` is used (minSdk=24 < API-26).
 */
@CapacitorPlugin(name = "DeviceAuth")
public class DeviceAuthPlugin extends Plugin {

    private static final String KEYSTORE_ALIAS = "paddy_device_key";
    private static final String PREFS = "paddy_device_auth";
    private static final String PREF_FP = "authorized_fp";
    private static final int DEFAULT_PORT = 18777;

    private ServerSocket serverSocket;
    private Thread serverThread;

    private boolean hasKey() {
        try {
            KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
            ks.load(null);
            return ks.containsAlias(KEYSTORE_ALIAS);
        } catch (Exception e) {
            return false;
        }
    }

    /** Generate the device key pair if missing; returns fingerprint + SPKI. */
    private JSObject ensureKeyPair() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        PublicKey pub;
        if (!ks.containsAlias(KEYSTORE_ALIAS)) {
            KeyPairGenerator kpg = KeyPairGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore");
            kpg.initialize(new KeyGenParameterSpec.Builder(
                KEYSTORE_ALIAS,
                KeyProperties.PURPOSE_SIGN | KeyProperties.PURPOSE_VERIFY)
                .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                .setDigests(KeyProperties.DIGEST_SHA256)
                .build());
            pub = kpg.generateKeyPair().getPublic();
        } else {
            pub = ks.getCertificate(KEYSTORE_ALIAS).getPublicKey();
        }
        byte[] spki = pub.getEncoded(); // X.509 SubjectPublicKeyInfo (DER)
        JSObject out = new JSObject();
        out.put("fp", sha256Hex(spki));
        out.put("spkiB64", Base64.encodeToString(spki, Base64.NO_WRAP));
        return out;
    }

    private static String sha256Hex(byte[] data) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(data);
        StringBuilder sb = new StringBuilder();
        for (byte b : digest) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", true);
        result.put("hasKey", hasKey());
        result.put("savedFp", prefs().getString(PREF_FP, null));
        call.resolve(result);
    }

    @PluginMethod
    public void ensureKeyPair(PluginCall call) {
        try {
            call.resolve(ensureKeyPair());
        } catch (Exception e) {
            call.reject("Failed to create device key: " + e.getMessage());
        }
    }

    @PluginMethod
    public void deactivate(PluginCall call) {
        try {
            if (hasKey()) {
                KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
                ks.load(null);
                ks.deleteEntry(KEYSTORE_ALIAS);
            }
            prefs().edit().clear().apply();
            stopServerQuietly();
            notifyListeners("deviceDeactivated", new JSObject());
            call.resolve();
        } catch (Exception e) {
            call.reject("Deactivation failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void startActivationServer(PluginCall call) {
        // Repair: the "already running" guard requires BOTH a live thread AND
        // an open socket. A cancelled/stopped attempt closes the socket while
        // the thread may linger briefly — without the socket check the guard
        // would resolve "already running" and the installer could never reach
        // /challenge again until the app restarted.
        if (serverSocket != null && !serverSocket.isClosed()
                && serverThread != null && serverThread.isAlive()) {
            call.resolve(); // already running
            return;
        }
        stopServerQuietly(); // reset any stale socket/thread before rebinding
        int port = call.getInt("port", DEFAULT_PORT);
        try {
            serverSocket = new ServerSocket(port, 8, InetAddress.getLoopbackAddress());
        } catch (IOException e) {
            log("bind FAILED on port " + port + ": " + e.getMessage());
            call.reject("Cannot bind activation server: " + e.getMessage());
            return;
        }
        serverThread = new Thread(this::serveLoop, "PaddyActivationServer");
        serverThread.setDaemon(true);
        serverThread.start();
        log("listening on 127.0.0.1:" + port + " (loopback only)");
        call.resolve();
    }

    @PluginMethod
    public void stopActivationServer(PluginCall call) {
        stopServerQuietly();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        stopServerQuietly();
        super.handleOnDestroy();
    }

    private void stopServerQuietly() {
        try {
            if (serverSocket != null && !serverSocket.isClosed()) {
                serverSocket.close();
                log("server stopped");
            }
        } catch (IOException ignored) {
        }
        serverSocket = null;
    }

    /** Diagnostic logging — lifecycle only. NEVER logs keys/secrets/nonces. */
    private static void log(String msg) {
        android.util.Log.i("PaddyDeviceAuth", msg);
    }

    private void serveLoop() {
        while (serverSocket != null && !serverSocket.isClosed()) {
            try {
                Socket sock = serverSocket.accept();
                handleConnection(sock);
                sock.close();
            } catch (Exception e) {
                if (serverSocket == null || serverSocket.isClosed()) return;
            }
        }
    }

    private void handleConnection(Socket sock) throws IOException {
        String requestLine = readLine(sock);
        log("request: " + (requestLine == null ? "<empty>" : requestLine));
        if (requestLine == null || requestLine.isEmpty()) return;
        int contentLength = 0;
        String line;
        while ((line = readLine(sock)) != null && !line.isEmpty()) {
            if (line.toLowerCase().startsWith("content-length:")) {
                contentLength = Integer.parseInt(line.substring(15).trim());
            }
        }
        byte[] body = new byte[contentLength];
        int off = 0;
        while (off < contentLength) {
            int n = sock.getInputStream().read(body, off, contentLength - off);
            if (n < 0) break;
            off += n;
        }
        String bodyStr = new String(body, 0, off, StandardCharsets.UTF_8);

        if (requestLine.startsWith("GET /challenge")) {
            try {
                respond(sock, 200, buildChallenge().toString());
            } catch (Exception e) {
                respond(sock, 500, "{\"error\":\"challenge failed\"}");
            }
        } else if (requestLine.startsWith("POST /activate")) {
            handleActivate(sock, bodyStr);
        } else if (requestLine.startsWith("POST /deactivate")) {
            deactivateInternal();
            respond(sock, 200, "{\"ok\":true}");
        } else if (requestLine.startsWith("GET /status")) {
            JSObject st = new JSObject();
            st.put("authorizedFp", prefs().getString(PREF_FP, null));
            respond(sock, 200, st.toString());
        } else {
            respond(sock, 404, "{\"error\":\"not found\"}");
        }
    }

    /** Build a fresh challenge: device key fingerprint + random nonce. */
    private JSObject buildChallenge() throws Exception {
        JSObject kp = ensureKeyPair();
        byte[] nonce = new byte[16];
        new SecureRandom().nextBytes(nonce);
        StringBuilder hex = new StringBuilder();
        for (byte b : nonce) hex.append(String.format("%02x", b));
        prefs().edit().putString("pending_nonce", hex.toString()).apply();

        JSObject out = new JSObject();
        out.put("fp", kp.getString("fp"));
        out.put("spki", kp.getString("spkiB64"));
        out.put("nonce", hex.toString());
        return out;
    }

    /**
     * Verify the master signature over "1|fp|nonce|at" using the master PUBLIC
     * key bundled as an APK asset. On success the device marks itself authorized
     * and notifies the JS layer.
     */
    private void handleActivate(Socket sock, String body) throws IOException {
        try {
            String certFp = jsonStr(body, "fp");
            String nonce = jsonStr(body, "nonce");
            String at = jsonStr(body, "at");
            String sigB64 = jsonStr(body, "sig");
            if (certFp == null || nonce == null || at == null || sigB64 == null) {
                respond(sock, 400, "{\"error\":\"missing fields\"}");
                return;
            }
            String pending = prefs().getString("pending_nonce", null);
            if (!nonce.equals(pending)) {
                respond(sock, 403, "{\"error\":\"nonce mismatch\"}");
                return;
            }
            PublicKey masterPub = loadMasterPublicKey();
            if (masterPub == null) {
                respond(sock, 500, "{\"error\":\"master public key missing from assets\"}");
                return;
            }
            Signature verifier = Signature.getInstance("SHA256withECDSA");
            verifier.initVerify(masterPub);
            verifier.update(("1|" + certFp + "|" + nonce + "|" + at)
                .getBytes(StandardCharsets.UTF_8));
            boolean valid = verifier.verify(Base64.decode(sigB64, Base64.DEFAULT));
            if (!valid) {
                respond(sock, 403, "{\"error\":\"invalid signature\"}");
                return;
            }
            prefs().edit()
                .putString(PREF_FP, certFp)
                .remove("pending_nonce")
                .apply();
            stopServerQuietly();

            JSObject event = new JSObject();
            event.put("fp", certFp);
            notifyListeners("deviceActivated", event);

            respond(sock, 200, "{\"ok\":true}");
        } catch (Exception e) {
            respond(sock, 400, "{\"error\":\"" + e.getMessage() + "\"}");
        }
    }

    /** Deactivation used by the installer transfer flow (via adb). */
    private void deactivateInternal() {
        try {
            if (hasKey()) {
                KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
                ks.load(null);
                ks.deleteEntry(KEYSTORE_ALIAS);
            }
            prefs().edit().clear().apply();
            stopServerQuietly();
            notifyListeners("deviceDeactivated", new JSObject());
        } catch (Exception ignored) {
        }
    }

    /** Load the master EC public key from APK assets (base64 SPKI). */
    private PublicKey loadMasterPublicKey() throws Exception {
        InputStream in = getContext().getAssets().open("master_pub.b64");
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] chunk = new byte[4096];
        int n;
        while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
        in.close();
        byte[] spki = Base64.decode(buf.toByteArray(), Base64.DEFAULT);
        return KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(spki));
    }

    private static String jsonStr(String json, String key) {
        if (json == null) return null;
        String needle = "\"" + key + "\"";
        int k = json.indexOf(needle);
        if (k < 0) return null;
        int colon = json.indexOf(':', k + needle.length());
        if (colon < 0) return null;
        int open = json.indexOf('"', colon);
        if (open < 0) return null;
        int close = json.indexOf('"', open + 1);
        if (close < 0) return null;
        return json.substring(open + 1, close);
    }

    private static void respond(Socket sock, int status, String json) throws IOException {
        byte[] payload = json.getBytes(StandardCharsets.UTF_8);
        OutputStream out = sock.getOutputStream();
        out.write(("HTTP/1.1 " + status + " OK\r\n"
            + "Content-Type: application/json\r\n"
            + "Content-Length: " + payload.length + "\r\n"
            + "Connection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        out.write(payload);
        out.flush();
    }

    private static String readLine(Socket sock) throws IOException {
        StringBuilder sb = new StringBuilder();
        int c;
        while ((c = sock.getInputStream().read()) != -1) {
            if (c == '\n') return sb.toString().trim();
            if (c != '\r') sb.append((char) c);
            if (sb.length() > 8192) break;
        }
        return sb.length() > 0 ? sb.toString() : null;
    }
}



