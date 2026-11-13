package io.github.emmanuelquintana.capri

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import org.json.JSONObject
import java.util.Locale

/**
 * "Capri, …": her ears and her voice. Only when you turned it on (the app's Settings), with the
 * microphone allowed, and only while the screen is on: Android's speech recognizer, over and over,
 * waiting for her name; what comes after it goes to her page (listen.js), which answers, and she
 * says it out loud (TextToSpeech). Nothing is recorded or kept: the recognizer hands back words,
 * and only the ones after her name leave this class.
 */
class Ears(private val service: CapriService) {
    private val main = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var listening = false   // the recognizer is on right now
    private var wanted = false      // it should be (on, allowed, screen on, not talking)
    private var speaking = false
    private var awakeUntil = 0L     // just her name: what comes next is for her, even without it
    private var failures = 0
    private var torch = false
    private var movedAt = 0L        // when the phone last moved in your hand (the rustle it makes isn't you talking)

    // (1.9.0) "activa el micro como loco aun si no hay ningún sonido": in silence the recognizer gives
    // up after a few seconds and was started again at once, so the mic went on and off all the time.
    // Android 13+ can keep one session open, handing back each thing said on its own (a "segmented
    // session"): the mic stays on, steady, and starts again about once a minute. A phone whose
    // recognizer won't do it is noticed (sessions that keep ending early with nothing) and goes back to
    // the old way, with a short rest between tries when nothing at all was heard.
    // (1.9.1) remembered: a phone that closed her each time it lost her picture started over, trying the
    // long session again (and failing, "error 5") after every restart. Known again after an update.
    private var segmented: Boolean? = service.getSharedPreferences("app", Context.MODE_PRIVATE)
        .getString(SEG_PREF, null)?.takeIf { it.startsWith(SEG_KEY) }?.let { it.endsWith(":1") }
    private var longNow = false     // this session is a segmented one
    private var sessionAt = 0L
    private var segments = 0
    private var shortOnes = 0
    private var quiet = 0           // sessions in a row that heard nothing at all (the old way)
    private var peak = NO_RMS       // the loudest moment of what's being said (how close the voice is)

    private fun knowSegmented(can: Boolean) {
        segmented = can
        service.getSharedPreferences("app", Context.MODE_PRIVATE).edit().putString(SEG_PREF, "$SEG_KEY${if (can) 1 else 0}").apply()
    }

    // (1.9.1) "se escucha un pitido cada vez que activa y desactiva el micro": the recognizer's own beep,
    // on the media sound. Only that one, never your calls, alarms or notifications, is
    // muted while her mic opens and closes, and never while something plays (she lets go of the mic as
    // soon as a video or song starts). Each comes back as it was: a sound you had muted yourself isn't
    // touched, and what she muted is written down, so it comes back even if the app closed meanwhile.
    private val hushed = HashSet<Int>()
    private val unhushNow = Runnable { unhush() }

    private var soundUntil = 0L

    /** Her page is about to make a sound of its own (a blip, her hello): heard, not muted. */
    fun sound() = main.post {
        soundUntil = System.currentTimeMillis() + 4000
        unhush()
    }

    /** Her beep muted for [ms] more (each call moves the end). */
    private fun hush(ms: Long) {
        if (System.currentTimeMillis() < soundUntil) return
        val audio = service.getSystemService(AudioManager::class.java) ?: return
        var changed = false
        for (stream in HUSH) {
            if (stream in hushed || audio.isStreamMute(stream)) continue
            if (runCatching { audio.adjustStreamVolume(stream, AudioManager.ADJUST_MUTE, 0) }.isSuccess) {
                hushed.add(stream)
                changed = true
            }
        }
        if (changed) saveHushed()
        main.removeCallbacks(unhushNow)
        if (hushed.isNotEmpty()) main.postDelayed(unhushNow, ms)
    }

    private fun unhush() {
        main.removeCallbacks(unhushNow)
        if (hushed.isEmpty()) return
        val audio = service.getSystemService(AudioManager::class.java)
        hushed.forEach { stream -> runCatching { audio?.adjustStreamVolume(stream, AudioManager.ADJUST_UNMUTE, 0) } }
        hushed.clear()
        saveHushed()
    }

    private fun saveHushed() {
        service.getSharedPreferences("app", Context.MODE_PRIVATE).edit().putString(HUSH_PREF, hushed.joinToString(",")).commit()
    }

    init {
        // left muted by a closing she didn't see coming: back as they were
        val left = service.getSharedPreferences("app", Context.MODE_PRIVATE).getString(HUSH_PREF, "").orEmpty()
        if (left.isNotBlank()) {
            hushed.addAll(left.split(',').mapNotNull { it.trim().toIntOrNull() }.filter { it in HUSH })
            unhush()
        }
    }

    // (1.9.0) the phone moving: no permission, only how hard, never where
    private val motion = object : SensorEventListener {
        override fun onSensorChanged(e: SensorEvent) {
            val v = e.values
            val g = Math.sqrt((v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).toDouble())
            if (Math.abs(g - SensorManager.GRAVITY_EARTH) > MOVED) movedAt = System.currentTimeMillis()
        }
        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    }
    // (1.9.0) "pongo el video en pausa para hablar con Capri y no me escucha o solo la mitad": she waited
    // for the sound to stop by checking every 3 s. Android now tells her the moment a player stops, and
    // she starts listening right then.
    private val players = object : AudioManager.AudioPlaybackCallback() {
        override fun onPlaybackConfigChanged(configs: MutableList<android.media.AudioPlaybackConfiguration>?) {
            if (!wanted || listening || speaking) return
            main.removeCallbacks(quietNow)
            main.postDelayed(quietNow, 250)
        }
    }
    private val quietNow = Runnable {
        val audio = service.getSystemService(AudioManager::class.java) ?: return@Runnable
        if (!wanted || listening || speaking) return@Runnable
        if (!audio.isMusicActive) next(0) else main.postDelayed(quietLater, 600)
    }
    private val quietLater = Runnable {
        val audio = service.getSystemService(AudioManager::class.java) ?: return@Runnable
        if (wanted && !listening && !speaking && !audio.isMusicActive) next(0)
    }
    private var watchingPlayers = false
    private fun watchPlayers(on: Boolean) {
        if (on == watchingPlayers) return
        val audio = service.getSystemService(AudioManager::class.java) ?: return
        watchingPlayers = on
        runCatching { if (on) audio.registerAudioPlaybackCallback(players, main) else audio.unregisterAudioPlaybackCallback(players) }
    }

    private var sensing = false
    private fun sense(on: Boolean) {
        if (on == sensing) return
        val sm = service.getSystemService(SensorManager::class.java) ?: return
        sensing = on
        if (on) sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)?.let { sm.registerListener(motion, it, SensorManager.SENSOR_DELAY_NORMAL) }
        else sm.unregisterListener(motion)
    }

    /** Switched on or off, the screen on or off, the mic allowed or not: listening or not. */
    fun update() = main.post {
        val pm = service.getSystemService(PowerManager::class.java)!!
        val should = enabled(service) && allowed(service) && pm.isInteractive && SpeechRecognizer.isRecognitionAvailable(service) && !CapriService.gamer
        status = when {
            !enabled(service) -> ""
            !allowed(service) -> "nomic"
            !SpeechRecognizer.isRecognitionAvailable(service) -> "norecognizer"
            !pm.isInteractive -> "screenoff"
            CapriService.gamer -> "gamer"
            else -> status
        }
        if (should == wanted) return@post
        wanted = should
        sense(should)
        watchPlayers(should)
        if (should) {
            failures = 0
            Diag.add("I", "listening for her name")
            next(0)
        } else stop()
    }

    private fun stop() {
        main.removeCallbacksAndMessages(null)
        listening = false
        recognizer?.let { runCatching { it.cancel() }; runCatching { it.destroy() } }
        recognizer = null
        unhush()
    }

    fun destroy() {
        sense(false)
        watchPlayers(false)
        wanted = false
        stop()
        tts?.shutdown()
        tts = null
    }

    private fun next(delay: Long) {
        main.removeCallbacks(go)
        main.postDelayed(go, delay)
    }

    private val go = Runnable { start() }

    private fun start() {
        if (!wanted || speaking || listening) return
        // a call, a voice note, another app recording: the mic is theirs
        val audio = service.getSystemService(AudioManager::class.java)!!
        if (audio.mode != AudioManager.MODE_NORMAL) {
            status = "busy"
            return next(5000)
        }
        // a video or music playing: the recognizer takes the sound from it each time it starts (the
        // video pauses, the song stops), so she waits for it to end
        if (audio.isMusicActive) {
            status = "media"
            return next(700) // (1.9.0: was 3 s, so after you paused a video she was deaf for up to 3 s)
        }
        val r = recognizer ?: create().also { recognizer = it }
        val lang = language()
        // how you talk (the app's Settings › Her ears): a slow talker gets longer pauses
        val pause = when (Store(service).configString("voicePace")) { "slow" -> 2600L; "fast" -> 1000L; else -> 1500L }
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
            .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
            .putExtra(RecognizerIntent.EXTRA_CONFIDENCE_SCORES, true)
            // a short pause after "Capri" doesn't end what you're saying
            .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, pause)
            .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, pause - 300L)
            .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
            .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, service.packageName)
        // Android 13+: her name weighs more than the noise around (a TV, people talking). Only with her
        // filter at normal: biased like that, the rustle of the phone moving in your hand came out as
        // "Capri" (1.9.0: "muevo el celular sin decir nada y se activa")
        if (Build.VERSION.SDK_INT >= 33 && (Store(service).configString("voiceFilter") ?: "normal") == "normal") {
            intent.putExtra(RecognizerIntent.EXTRA_ENABLE_BIASING_DEVICE_CONTEXT, true)
                .putStringArrayListExtra(RecognizerIntent.EXTRA_BIASING_STRINGS, arrayListOf("Capri", "Kapri", "Капри"))
        }
        // one long session (Android 13+) when this phone's recognizer keeps it open
        longNow = Build.VERSION.SDK_INT >= 33 && segmented != false
        if (longNow) {
            intent.putExtra(RecognizerIntent.EXTRA_SEGMENTED_SESSION, RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS)
                .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, SESSION_MS)
        }
        sessionAt = System.currentTimeMillis()
        segments = 0
        peak = NO_RMS
        listening = true
        playing = 0
        main.removeCallbacks(mediaCheck)
        main.postDelayed(mediaCheck, MEDIA_EVERY)
        // her beep, as the mic opens (a short session: also as it closes, a few seconds later)
        hush(if (longNow) 2500L else 12_000L)
        main.removeCallbacks(hushEnd)
        if (longNow) main.postDelayed(hushEnd, SESSION_MS - 1500L)
        runCatching { r.startListening(intent) }.onFailure {
            listening = false
            failed(SpeechRecognizer.ERROR_CLIENT)
        }
    }

    // a long session about to end on its own: her beep as it closes
    private val hushEnd = Runnable { if (listening && longNow) hush(4000L) }

    // a video or song starts while she listens: she lets go of the mic (it would take its sound, and
    // its sound would be muted). Twice in a row, so her own short beep doesn't count.
    private var playing = 0
    private val mediaCheck: Runnable = object : Runnable {
        override fun run() {
            if (!listening) return
            playing = if (service.getSystemService(AudioManager::class.java)?.isMusicActive == true) playing + 1 else 0
            if (playing >= 2) {
                recognizer?.let { runCatching { it.cancel() } }
                listening = false
                main.removeCallbacks(hushEnd)
                unhush()
                status = "media"
                next(3000)
                return
            }
            main.postDelayed(this, MEDIA_EVERY)
        }
    }

    /** A session ended. Segmented ones that end early with nothing, again and again: this phone can't. */
    private fun ended(gotWords: Boolean) {
        if (!longNow) return
        val short = System.currentTimeMillis() - sessionAt < SESSION_MS / 3
        if (segments > 0 || !short) {
            if (segmented != true) {
                Diag.add("I", "voice: one long session (the mic stays on)")
                knowSegmented(true)
            }
            shortOnes = 0
        } else if (!gotWords && segmented == null && ++shortOnes >= 3) {
            knowSegmented(false)
            Diag.add("I", "voice: this phone's recognizer listens a few seconds at a time")
        }
    }

    // on the phone itself when it can (Android 12+, its speech pack installed): nothing goes out
    private fun create(): SpeechRecognizer {
        // Google's when it's there (some phones default to their own, which won't listen from a service),
        // else the phone's default; the on-device one only when those keep failing
        val google = runCatching {
            service.packageManager.queryIntentServices(Intent(android.speech.RecognitionService.SERVICE_INTERFACE), 0)
                .firstOrNull { it.serviceInfo.packageName == GOOGLE }
                ?.let { android.content.ComponentName(it.serviceInfo.packageName, it.serviceInfo.name) }
        }.getOrNull()
        val local = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && failures >= 4 && failures % 2 == 0 &&
            runCatching { SpeechRecognizer.isOnDeviceRecognitionAvailable(service) }.getOrDefault(false)
        val r = when {
            local -> SpeechRecognizer.createOnDeviceSpeechRecognizer(service)
            google != null && failures % 3 != 2 -> SpeechRecognizer.createSpeechRecognizer(service, google)
            else -> SpeechRecognizer.createSpeechRecognizer(service)
        }
        r.setRecognitionListener(object : RecognitionListener {
            override fun onResults(results: Bundle?) {
                listening = false
                failures = 0
                quiet = 0
                hush(800) // (her closing beep; the next session starts before it ends)
                val words = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
                ended(words.isNotEmpty())
                heard(words, results?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES))
                next(150)
            }
            // a long session: each thing said, as it ends, and she keeps listening
            override fun onSegmentResults(segmentResults: Bundle) {
                segments++
                failures = 0
                val words = segmentResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
                if (words.any { it.isNotBlank() }) heard(words, segmentResults.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES))
                peak = NO_RMS
                if (status != "heard" && status != "moved" && status != "other" && status != "far") status = "listening"
            }
            override fun onEndOfSegmentedSession() {
                listening = false
                hush(800)
                ended(true)
                next(150)
            }
            override fun onError(error: Int) {
                listening = false
                hush(800)
                failed(error)
            }
            override fun onReadyForSpeech(params: Bundle?) {
                status = "listening"
                // the mic is open, its beep played: a long session gives your sounds back now
                if (longNow) hush(400)
            }
            // you started or stopped talking: her sign that she's listening (hearing.js), only
            // shown right after her name
            override fun onBeginningOfSpeech() = speech(true)
            override fun onRmsChanged(rmsdB: Float) {
                if (rmsdB > peak) peak = rmsdB
            }
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() = speech(false)
            override fun onPartialResults(partialResults: Bundle?) {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        return r
    }

    private fun speech(on: Boolean) {
        val awake = System.currentTimeMillis() < awakeUntil
        service.overlay?.emit("ears:speech", JSONObject().put("on", on).put("awake", awake).toString())
    }

    private fun failed(error: Int) {
        when (error) {
            // silence, or words that weren't words: listen again right away
            // (the old way, a few quiet ones in a row: a short rest between them, not a mic blinking nonstop)
            SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> {
                failures = 0
                ended(false)
                quiet = if (error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) quiet + 1 else 0
                next(if (longNow || quiet < 3) 200L else minOf(1500L, 300L * quiet))
            }
            // (1.9.1) "Falló el reconocedor de voz (error 5)" over and over: 5 is the recognizer saying it
            // can't do what was asked (a long session, on many phones) or that it was still busy with the
            // last one. Not your microphone failing: a fresh recognizer, the short way if it was the
            // long session, soon, and the error only shown if it keeps happening.
            SpeechRecognizer.ERROR_CLIENT, SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> {
                recognizer?.let { runCatching { it.cancel() }; runCatching { it.destroy() } }
                recognizer = null
                if (error == SpeechRecognizer.ERROR_CLIENT && longNow && segmented != true) {
                    knowSegmented(false)
                    Diag.add("I", "voice: no long session here (error 5), the short way")
                    return next(400)
                }
                failures++
                if (failures >= 4) status = "error:$error"
                if (failures == 1 || failures % 10 == 0) Diag.add("W", "voice: recognizer error $error")
                next(minOf(15_000L, 600L * failures))
            }
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> {
                status = "nomic"
                Diag.add("W", "voice: no microphone permission")
                wanted = false
                stop()
            }
            else -> {
                // busy, no network, the on-device one not ready: a fresh recognizer, a little later each time
                failures++
                recognizer?.let { runCatching { it.destroy() } }
                recognizer = null
                status = "error:$error"
                if (failures == 1 || failures % 10 == 0) Diag.add("W", "voice: recognizer error $error")
                next(minOf(60_000L, 1000L * failures * failures))
            }
        }
    }

    private fun heard(options: List<String>, scores: FloatArray? = null) {
        val now = System.currentTimeMillis()
        val plain = options.map { plain(it) }
        // her noise filter (the app's Settings › Her ears): stricter, she only answers to her name
        // said first, said clearly; the TV or people around saying something like it don't count
        val filter = Store(service).configString("voiceFilter") ?: "normal"
        val minScore = when (filter) { "strict" -> 0.45f; "strictest" -> 0.7f; else -> 0f }
        val clear = { i: Int -> scores == null || i >= scores.size || scores[i] < 0f || scores[i] >= minScore || scores.all { it == 0f } }
        val first = { s: String -> NAME.find(s)?.let { m -> s.substring(0, m.range.first).trim().split(Regex("\\s+")).count { it.isNotEmpty() } <= 1 } ?: false }
        val at = plain.indices.firstOrNull { i ->
            NAME.containsMatchIn(plain[i]) && clear(i) && (filter == "normal" || first(plain[i]))
        } ?: -1
        val named0 = if (at >= 0) plain[at] else null
        heardLast = options.firstOrNull() ?: ""
        // (1.9.0) noise heard as words: her name alone, unsure, or one or two letters after it. With her
        // filter on, her name alone must be clear (it opens 10 s where anything you say is for her)
        val restOf = { s: String -> s.substring(NAME.find(s)!!.range.last + 1).trim(' ', ',', '.', '!', '?') }
        val alone = named0 != null && restOf(named0).isEmpty()
        val sure = { i: Int -> scores == null || i >= scores.size || scores[i] < 0f || scores.all { it == 0f } || scores[i] >= minScore + 0.2f }
        // the phone moved while that was heard, with her filter on: its rustle, not you, unless it's very clear
        val shaken = filter != "normal" && now - movedAt < SHAKEN_MS &&
            !(scores != null && scores.isNotEmpty() && scores[0] >= 0.85f)
        if (shaken) {
            status = "moved"
            return
        }
        // (1.9.0) her strictest filter: a voice from across the room (the TV, someone else) is quieter
        // than yours at the phone. Only when the recognizer says how loud it was.
        val loud = peak
        peak = NO_RMS
        if (filter == "strictest" && loud > NO_RMS && loud < FAR_RMS && plain.any { NAME.containsMatchIn(it) }) {
            status = "far"
            Diag.add("I", "voice: too far away (${"%.1f".format(loud)} dB)")
            return
        }
        val named = when {
            named0 == null -> null
            alone && filter != "normal" && !sure(at) -> null
            !alone && restOf(named0).replace(" ", "").length < 3 && filter != "normal" -> null
            else -> named0
        }
        val text = when {
            named != null -> options[at] // as you said it (her page finds her name in it)
            // what comes after her name alone: words, clear ones with her filter on (not the phone moving)
            now < awakeUntil && options.isNotEmpty() && plain[0].replace(" ", "").length >= 3 && (filter == "normal" || clear(0)) -> options[0]
            else -> {
                status = "other"
                return
            }
        }
        status = "heard"
        val rest = if (named != null) named.substring(NAME.find(named)!!.range.last + 1).trim(' ', ',', '.', '!', '?') else text
        // just her name: what you say in the next few seconds is for her too
        awakeUntil = if (rest.isEmpty() && named != null) now + 10_000 else 0L
        service.overlay?.emit("capri:heard", JSONObject().put("text", text).toString())
    }

    /** Her answer, out loud (not on silent or vibrate), and not heard by her own ears meanwhile. */
    fun say(text: String, lang: String) = main.post {
        val audio = service.getSystemService(AudioManager::class.java)!!
        // her own beep's mute off first: her voice goes through the media volume too
        unhush()
        main.removeCallbacks(hushEnd)
        // out loud through the media volume (what music uses): her ears asked you for it, even on silent
        if (text.isBlank() || audio.getStreamVolume(AudioManager.STREAM_MUSIC) == 0) return@post
        val speak = {
            voice(accent(lang))
            // her voice as you set it (the app's Settings › Her ears)
            val store = Store(service)
            tts?.setPitch(store.configNumber("voicePitch", 1.0).toFloat().coerceIn(0.5f, 2f))
            tts?.setSpeechRate(store.configNumber("voiceRate", 1.0).toFloat().coerceIn(0.5f, 2f))
            speaking = true
            recognizer?.let { runCatching { it.cancel() } }
            listening = false
            tts?.speak(text.take(600), TextToSpeech.QUEUE_FLUSH, null, "capri")
            // never deaf for good if the voice engine forgets to say it's done
            main.removeCallbacks(unstuck)
            main.postDelayed(unstuck, 30_000)
            Unit
        }
        if (tts != null && ttsReady) {
            speak()
            return@post
        }
        if (tts == null) {
            tts = TextToSpeech(service) { status ->
                main.post {
                    ttsReady = status == TextToSpeech.SUCCESS
                    if (ttsReady) speak()
                }
            }.apply {
                setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) {}
                    override fun onDone(utteranceId: String?) = main.post { spoke() }.let {}
                    @Deprecated("Deprecated in Java")
                    override fun onError(utteranceId: String?) = main.post { spoke() }.let {}
                })
            }
        }
    }

    private val unstuck = Runnable { if (speaking) spoke() }

    private fun spoke() {
        main.removeCallbacks(unstuck)
        speaking = false
        if (wanted) next(300)
    }

    /** The flashlight: on, off, or the other way (null). Null back when the phone has none. */
    fun torch(on: Boolean?): Boolean? {
        val cm = service.getSystemService(CameraManager::class.java) ?: return null
        val id = runCatching {
            cm.cameraIdList.firstOrNull { cm.getCameraCharacteristics(it).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true }
        }.getOrNull()
        if (id == null) {
            Diag.add("I", "voice: no flashlight on this phone")
            return null
        }
        val want = on ?: !torch
        return runCatching { cm.setTorchMode(id, want); torch = want; want }
            .onFailure { Diag.add("W", "voice: flashlight: ${it.message}") }
            .getOrNull()
    }

    private fun language(): String {
        val lang = Store(service).configString("lang")?.takeIf { it != "auto" } ?: Locale.getDefault().language
        return when (lang.substringBefore('-')) {
            "es" -> accent("es-MX")
            "en" -> accent("en-US")
            "fr" -> accent("fr-FR")
            "pt" -> accent("pt-BR")
            "it" -> accent("it-IT")
            "ru" -> "ru-RU"
            else -> Locale.getDefault().toLanguageTag()
        }
    }

    /** Her accent in that language, as you picked it (the app's Settings › Her ears), else `tag`. */
    private fun accent(tag: String): String {
        val base = tag.substringBefore('-')
        val picked = Store(service).configString("voiceAccent_$base")
        return if (picked != null && ACCENTS[base]?.any { it.first == picked } == true) picked else tag
    }

    /** That accent's voice of the phone's speech engine, installed ones first; its language if it has none. */
    private fun voice(tag: String) {
        val t = tts ?: return
        val want = Locale.forLanguageTag(tag)
        val v = runCatching {
            t.voices?.filter { it.locale.language == want.language && it.locale.country == want.country && "notInstalled" !in it.features }
                ?.sortedWith(compareBy({ it.isNetworkConnectionRequired }, { -it.quality }))?.firstOrNull()
        }.getOrNull()
        if (v != null && runCatching { t.setVoice(v) }.getOrDefault(TextToSpeech.ERROR) == TextToSpeech.SUCCESS) return
        t.language = want
    }

    companion object {
        // her name as recognizers write it: Capri, Kapri, Capry, Cabri, Caprí, Capris… (Капри in Russian)
        private val NAME = Regex("(?<![a-zа-я])(?:[ck]a[pb]r[iy]s?|ка[пб]р[иы])(?![a-zа-я])")
        private const val GOOGLE = "com.google.android.googlequicksearchbox"
        private const val MOVED = 2.2 // m/s² off gravity: the phone moved in your hand, not just held
        private const val SHAKEN_MS = 4000L
        private const val SESSION_MS = 60_000L // a long session's length (then a new one)
        private const val MEDIA_EVERY = 700L
        private val HUSH = intArrayOf(AudioManager.STREAM_MUSIC) // (not the system sounds: on phones they are the ringtone)
        private const val HUSH_PREF = "voiceHushed"
        private const val SEG_PREF = "voiceLong"
        private val SEG_KEY = "${Build.VERSION.SDK_INT}:${BuildConfig.VERSION_CODE}:"
        private const val NO_RMS = -100f
        private const val FAR_RMS = 4.5f // the recognizer's level (about -2 silence to 10 loud): under it, far away

        /** The accents she can have in each language (1.9.0): the first is hers until you pick another. */
        val ACCENTS = mapOf(
            "es" to listOf("es-MX" to R.string.accent_mx, "es-ES" to R.string.accent_es, "es-AR" to R.string.accent_ar, "es-CO" to R.string.accent_co, "es-US" to R.string.accent_us_latino),
            "en" to listOf("en-US" to R.string.accent_us, "en-GB" to R.string.accent_gb, "en-AU" to R.string.accent_au, "en-IN" to R.string.accent_in),
            "pt" to listOf("pt-BR" to R.string.accent_br, "pt-PT" to R.string.accent_pt),
            "fr" to listOf("fr-FR" to R.string.accent_fr, "fr-CA" to R.string.accent_ca),
        )

        /** What her ears are doing, for the app's Settings: "", listening, heard, other, busy, media, nomic, screenoff, error:N */
        @Volatile var status = ""
            private set
        @Volatile var heardLast = ""
            private set

        // lower case, no accents: "Caprí" is "capri"
        private fun plain(s: String) = java.text.Normalizer.normalize(s.lowercase(), java.text.Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "")
        private const val PREF = "voice"

        fun enabled(context: Context) = context.getSharedPreferences("app", Context.MODE_PRIVATE).getBoolean(PREF, false)

        fun allowed(context: Context) = context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

        fun setEnabled(context: Context, on: Boolean) {
            context.getSharedPreferences("app", Context.MODE_PRIVATE).edit().putBoolean(PREF, on).apply()
            CapriService.current?.voiceChanged()
        }
    }
}
