package io.github.emmanuelquintana.capri

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/** Explicit, one-shot foreground UI assistance. No event contents are collected or retained. */
class CapriControlService : AccessibilityService() {
    override fun onServiceConnected() { instance = this }
    override fun onAccessibilityEvent(event: AccessibilityEvent?) { /* intentionally empty */ }
    override fun onInterrupt() = Unit
    override fun onDestroy() { if (instance === this) instance = null; super.onDestroy() }

    fun readVisibleText(): String {
        val root = rootInActiveWindow ?: return ""
        val found = LinkedHashSet<String>()
        var visited = 0
        fun walk(n: AccessibilityNodeInfo?, depth: Int) {
            if (n == null || depth > 16 || visited++ >= 300 || found.size >= 80) return
            if (!n.isPassword) {
                n.text?.toString()?.trim()?.takeIf { it.isNotEmpty() && it.length <= 800 }?.let(found::add)
                n.contentDescription?.toString()?.trim()?.takeIf { it.isNotEmpty() && it.length <= 250 }?.let(found::add)
            }
            for (i in 0 until n.childCount) walk(n.getChild(i), depth + 1)
        }
        try { walk(root, 0) } finally { root.recycle() }
        return found.joinToString("\n").take(5000)
    }

    fun clickVisibleLabel(raw: String): String {
        val label = raw.trim()
        if (label.isEmpty() || label.length > 80) return "invalid_label"
        if (label.lowercase() in setOf("invia","send","elimina","delete","cancella","paga","pay","acquista","buy","compra","conferma","confirm","pubblica","post")) return "sensitive_action_blocked"
        val root = rootInActiveWindow ?: return "no_active_window"
        val matches = mutableListOf<AccessibilityNodeInfo>()
        var visited = 0
        fun walk(n: AccessibilityNodeInfo?, depth: Int) {
            if (n == null || depth > 16 || visited++ >= 300) return
            if (n.isVisibleToUser && n.isClickable &&
                (n.text?.toString()?.trim().equals(label,true) || n.contentDescription?.toString()?.trim().equals(label,true))) matches.add(n)
            for (i in 0 until n.childCount) walk(n.getChild(i), depth + 1)
        }
        return try {
            walk(root,0)
            if (matches.size != 1) "not_unique"
            else if (matches.single().performAction(AccessibilityNodeInfo.ACTION_CLICK)) "clicked" else "click_failed"
        } finally { matches.forEach { it.recycle() }; root.recycle() }
    }

    companion object {
        @Volatile var instance: CapriControlService? = null
            private set
    }
}