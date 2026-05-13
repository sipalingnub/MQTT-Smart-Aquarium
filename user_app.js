/**
 * ═══════════════════════════════════════════════════
 *  PUBLISHER 3: User_App
 *  Role   : Owner's control interface (interactive CLI)
 *           - Sends FEED command (QoS 2 + Expiry)
 *           - Queries food stock via Request-Response
 *  Features: QoS 2 (#1), Message Expiry (#6),
 *            Request-Response requester (#8)
 * ═══════════════════════════════════════════════════
 */

const { createClient } = require('./common/mqttClient');
const readline = require('readline');

// Unique response topic for this app session
// Using timestamp to avoid collision if multiple instances run
const RESPONSE_TOPIC = `aquarium/response/userapp_${Date.now()}`;

const client = createClient('user_app');

client.on('connect', () => {
    console.log('╔══════════════════════════════════════════╗');
    console.log('║       🐠  Smart Aquarium User App        ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log('║  COMMANDS:                               ║');
    console.log('║   f [grams]  → Feed fish (default: 5g)  ║');
    console.log('║   s          → Check food stock          ║');
    console.log('║   q          → Quit                      ║');
    console.log('╚══════════════════════════════════════════╝');

    // ── Subscribe to personal response topic ─────────────────────────────
    // [FEATURE 8] Request-Response — subscribe before sending any request
    client.subscribe(RESPONSE_TOPIC, { qos: 1 });
    console.log(`\n[USER_APP] ✅ Connected`);
    console.log(`[USER_APP] 📥 Listening for responses on: ${RESPONSE_TOPIC}\n`);
    console.log('> ', { end: '' });

    // Auto-demo: request stock every 20 seconds
    setTimeout(() => {
        setInterval(() => {
            console.log('\n[USER_APP] 🔄 Auto-requesting stock status...');
            requestStock();
        }, 20000);
    }, 5000);
});

// ─── Handle incoming response messages ────────────────────────────────────
client.on('message', (topic, message, packet) => {
    if (topic === RESPONSE_TOPIC) {
        // [FEATURE 8] Request-Response — response arrived at our personal topic
        const data          = JSON.parse(message.toString());
        const correlationId = packet.properties?.correlationData?.toString() || 'N/A';

        console.log('\n[USER_APP] 📦 STOCK RESPONSE received [Request-Response]:');
        console.log(`  Food Stock    : ${data.stock}${data.unit}`);
        console.log(`  Correlation ID: ${correlationId}`);
        console.log(`  Status        : ${data.status}`);
        console.log('> ');
    }
});

// ─────────────────────────────────────────────────────────────────────────
// [FEATURE 1] QoS 2 (Exactly Once) — critical: feed command must execute
//             exactly once even if network is unreliable.
// [FEATURE 6] Message Expiry Interval — command expires after 30 seconds.
//             If Dispenser_Node is offline > 30s, broker discards it.
//             This prevents stale "open gate" commands from executing
//             dangerously late.
// ─────────────────────────────────────────────────────────────────────────
function sendFeedCommand(amountGrams = 5) {
    const payload = JSON.stringify({
        action:    'FEED',
        amount:    amountGrams,
        from:      'User_App',
        ts:        Date.now()
    });

    client.publish('aquarium/dispenser/command', payload, {
        qos: 2,                         // [FEATURE 1] QoS 2 — Exactly Once
        properties: {
            messageExpiryInterval: 30   // [FEATURE 6] Expires in 30 seconds
        }
    });

    console.log(`\n[USER_APP] 🐟 FEED COMMAND sent [QoS 2 | Expiry: 30s]:`);
    console.log(`  Amount : ${amountGrams}g`);
    console.log(`  Note   : Broker will discard if not delivered within 30s`);
    console.log('> ');
}

// ─────────────────────────────────────────────────────────────────────────
// [FEATURE 8] Request-Response Pattern
// Sends a request with:
//   responseTopic   → broker routes Dispenser's reply here
//   correlationData → unique ID; lets us match the reply to this request
//                     (useful if multiple requests are in-flight)
// ─────────────────────────────────────────────────────────────────────────
function requestStock() {
    const correlationId = Buffer.from(`stock-req-${Date.now()}`);

    const payload = JSON.stringify({
        request: 'get_stock',
        from:    'User_App',
        ts:      Date.now()
    });

    client.publish('aquarium/request/stock', payload, {
        qos: 1,
        properties: {
            responseTopic:   RESPONSE_TOPIC,  // [FEATURE 8] Where to send the reply
            correlationData: correlationId     // [FEATURE 8] Unique request ID
        }
    });

    console.log(`\n[USER_APP] 🔍 STOCK REQUEST sent [Request-Response]:`);
    console.log(`  Response will arrive at : ${RESPONSE_TOPIC}`);
    console.log(`  Correlation ID          : ${correlationId.toString()}`);
    console.log('> ');
}

// ─── Interactive CLI ───────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.on('line', (input) => {
    const parts  = input.trim().split(' ');
    const cmd    = parts[0];
    const arg    = parts[1];

    switch (cmd) {
        case 'f':
        case 'feed': {
            const grams = parseInt(arg) || 5;
            sendFeedCommand(grams);
            break;
        }
        case 's':
        case 'stock':
            requestStock();
            break;
        case 'q':
        case 'quit':
            console.log('[USER_APP] 👋 Goodbye!');
            client.end();
            rl.close();
            process.exit(0);
            break;
        default:
            if (cmd) console.log('[USER_APP] Unknown command. Try: f [grams] | s | q');
            process.stdout.write('> ');
    }
});

process.on('SIGINT', () => {
    client.end();
    rl.close();
    process.exit(0);
});
