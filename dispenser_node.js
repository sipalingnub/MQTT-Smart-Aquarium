/**
 * ═══════════════════════════════════════════════════
 *  PUBLISHER 2: Dispenser_Node
 *  Role   : Smart fish feeder actuator
 *           - Subscribes to commands (QoS 2)
 *           - Publishes food stock status (Retain)
 *           - Handles Request-Response for stock queries
 *  Features: LWT (#7), Retain (#5), QoS 2 receive (#1),
 *            Request-Response responder (#8)
 * ═══════════════════════════════════════════════════
 */

const { createClient } = require('./common/mqttClient');

// ─────────────────────────────────────────────────
// [FEATURE 7] LWT for the Dispenser
// ─────────────────────────────────────────────────
const client = createClient('dispenser_node', {
    will: {
        topic:   'aquarium/dispenser/status',
        payload: JSON.stringify({ status: 'OFFLINE', node: 'Dispenser_Node', reason: 'unexpected_disconnect' }),
        qos:     1,
        retain:  true
    }
});

let foodStock = 100; // percentage (0–100)

client.on('connect', () => {
    console.log('[DISPENSER_NODE] ✅ Connected | LWT registered');

    // ── Publish online status (retained) ─────────────────────────────────
    // [FEATURE 5] Retain — dashboard always gets current dispenser status
    client.publish(
        'aquarium/dispenser/status',
        JSON.stringify({ status: 'ONLINE', node: 'Dispenser_Node', ts: Date.now() }),
        { qos: 1, retain: true }
    );
    console.log('[DISPENSER_NODE] 📢 Online status published (retained)');

    // ── Subscribe to feed commands ────────────────────────────────────────
    // [FEATURE 1] QoS 2 (Exactly Once) — feed must not execute twice
    client.subscribe('aquarium/dispenser/command', { qos: 2 });
    console.log('[DISPENSER_NODE] 📥 Subscribed: aquarium/dispenser/command (QoS 2)');

    // ── Subscribe to stock request topic ─────────────────────────────────
    // [FEATURE 8] Request-Response — listens for incoming data requests
    client.subscribe('aquarium/request/stock', { qos: 1 });
    console.log('[DISPENSER_NODE] 📥 Subscribed: aquarium/request/stock (Request-Response)');

    // ── Publish initial stock (retained) ─────────────────────────────────
    publishStock();

    // ── Periodic stock heartbeat every 10s ───────────────────────────────
    setInterval(() => {
        publishStock();
    }, 10000);
});

function publishStock() {
    // [FEATURE 5] Retain — broker always has the last known stock level
    client.publish(
        'aquarium/dispenser/stock',
        JSON.stringify({ stock: foodStock, unit: '%', ts: Date.now() }),
        { qos: 1, retain: true }
    );
    console.log(`[DISPENSER_NODE] 📊 Stock update: ${foodStock}% [RETAINED]`);
}

client.on('message', (topic, message, packet) => {
    let payload;
    try {
        payload = JSON.parse(message.toString());
    } catch (e) {
        return;
    }

    // ════════════════════════════════════════════════════════════════════
    // [FEATURE 1] Handle Feed Command — received at QoS 2 (Exactly Once)
    // ════════════════════════════════════════════════════════════════════
    if (topic === 'aquarium/dispenser/command') {
        console.log('\n[DISPENSER_NODE] 🍽️  FEED COMMAND received [QoS 2 — Exactly Once]:');
        console.log(`  Action : ${payload.action}`);
        console.log(`  Amount : ${payload.amount}g`);
        console.log(`  Sender : ${payload.from}`);

        if (payload.action === 'FEED') {
            foodStock = Math.max(0, foodStock - payload.amount);
            console.log(`[DISPENSER_NODE] ✅ Feeding executed! Stock remaining: ${foodStock}%`);

            // Publish updated stock immediately after feeding
            publishStock();

            // Send low-stock alert if below 20%
            if (foodStock < 20) {
                client.publish(
                    'aquarium/alert',
                    JSON.stringify({
                        level:   'WARNING',
                        message: `Food stock critically LOW: ${foodStock}% — Please refill!`,
                        ts:      Date.now()
                    }),
                    { qos: 1 }
                );
                console.log('[DISPENSER_NODE] ⚠️  Low-stock alert dispatched!');
            }
        }
    }

    // ════════════════════════════════════════════════════════════════════
    // [FEATURE 8] Request-Response Pattern
    // User_App publishes a request with:
    //   properties.responseTopic   → where to send the reply
    //   properties.correlationData → unique ID to match reply to request
    // Dispenser replies to that exact responseTopic, echoing correlationData.
    // ════════════════════════════════════════════════════════════════════
    if (topic === 'aquarium/request/stock') {
        const responseTopic   = packet.properties?.responseTopic;
        const correlationData = packet.properties?.correlationData;

        console.log(`\n[DISPENSER_NODE] 🔍 STOCK REQUEST received`);
        console.log(`  Response topic   : ${responseTopic}`);
        console.log(`  Correlation ID   : ${correlationData?.toString()}`);

        if (!responseTopic) {
            console.log('[DISPENSER_NODE] ⚠️  No responseTopic — ignoring');
            return;
        }

        // Build and send the response
        const responsePayload = JSON.stringify({
            stock:  foodStock,
            unit:   '%',
            status: 'ok',
            type:   'stock_response',
            ts:     Date.now()
        });

        client.publish(responseTopic, responsePayload, {
            qos: 1,
            properties: {
                correlationData   // [FEATURE 8] Echo back so requester can match it
            }
        });

        console.log(`[DISPENSER_NODE] ✅ RESPONSE sent → ${responseTopic} : ${responsePayload}`);
    }
});

// ─── Graceful shutdown ─────────────────────────────────────────────────────
process.on('SIGINT', () => {
    console.log('\n[DISPENSER_NODE] 🛑 Shutting down...');
    client.publish(
        'aquarium/dispenser/status',
        JSON.stringify({ status: 'OFFLINE', node: 'Dispenser_Node', reason: 'graceful_shutdown', ts: Date.now() }),
        { qos: 1, retain: true },
        () => {
            console.log('[DISPENSER_NODE] Goodbye!');
            client.end();
        }
    );
});
