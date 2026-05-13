/**
 * ═══════════════════════════════════════════════════
 *  SUBSCRIBER 2: Alert_Bot
 *  Role   : Alert handler — receives ONLY critical alerts.
 *           Run multiple instances to demonstrate load balancing.
 *  Features: Shared Subscriptions (#9)
 *
 *  HOW TO RUN MULTIPLE INSTANCES:
 *    Terminal A: node alert_bot.js 1
 *    Terminal B: node alert_bot.js 2
 *    → Each alert goes to ONLY ONE bot (round-robin)
 * ═══════════════════════════════════════════════════
 */

const { createClient } = require('./common/mqttClient');

// Instance ID from CLI argument (default: '1')
const instanceId = process.argv[2] || '1';

const client = createClient(`alert_bot_${instanceId}`);

let alertsHandled = 0;

client.on('connect', () => {
    console.log(`╔══════════════════════════════════════════════╗`);
    console.log(`║       🚨  Alert Bot — Instance #${instanceId.padEnd(12)}║`);
    console.log(`╚══════════════════════════════════════════════╝`);
    console.log(`[ALERT_BOT-${instanceId}] ✅ Connected`);

    // ─────────────────────────────────────────────────────────────────────
    // [FEATURE 9] Shared Subscriptions
    // Format: $share/<group_name>/<topic>
    //
    // When multiple Alert_Bot instances subscribe to the SAME group name
    // ('botgroup'), the broker distributes each incoming alert to exactly
    // ONE instance in the group (round-robin by default in Mosquitto).
    //
    // This prevents every bot from processing the same alert — enabling
    // horizontal scaling / load balancing of alert handlers.
    //
    // Compare with normal subscription ($share prefix absent):
    //   - Normal:  ALL subscribers receive EVERY message
    //   - Shared:  Messages are DISTRIBUTED across the group
    // ─────────────────────────────────────────────────────────────────────
    client.subscribe('$share/botgroup/aquarium/alert', { qos: 1 });
    console.log(`[ALERT_BOT-${instanceId}] 📥 Subscribed: $share/botgroup/aquarium/alert`);
    console.log(`[ALERT_BOT-${instanceId}] ⚡ Load-balanced — only ONE bot in the group handles each alert`);
    console.log(`[ALERT_BOT-${instanceId}] Waiting for alerts...\n`);
});

client.on('message', (topic, message) => {
    alertsHandled++;
    let alert;
    try {
        alert = JSON.parse(message.toString());
    } catch {
        alert = { level: 'UNKNOWN', message: message.toString() };
    }

    const time = new Date().toLocaleTimeString();

    console.log(`\n┌─ 🚨 ALERT #${alertsHandled} ─ ${time} ─────────────────────────┐`);
    console.log(`│  Handled by : Alert_Bot Instance #${instanceId}`);
    console.log(`│  Level      : ${alert.level}`);
    console.log(`│  Message    : ${alert.message || JSON.stringify(alert)}`);
    if (alert.ph)          console.log(`│  pH         : ${alert.ph}`);
    if (alert.temperature) console.log(`│  Temp       : ${alert.temperature}°C`);
    console.log(`└─────────────────────────────────────────────────────┘`);
    console.log(`  [This message was load-balanced to Bot #${instanceId} via $share/botgroup]`);
});

process.on('SIGINT', () => {
    console.log(`\n[ALERT_BOT-${instanceId}] 🛑 Shutting down (handled ${alertsHandled} alerts)`);
    client.end();
    process.exit(0);
});
