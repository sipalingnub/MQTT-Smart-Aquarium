/**
 * ═══════════════════════════════════════════════════
 *  PUBLISHER 1: Sensor_Node
 *  Role   : Simulates pH & Temperature sensors
 *  Features: LWT (#7), Topic Alias (#3), User Properties (#4),
 *            Retain (#5), QoS 0 (#1), Alert Publish
 * ═══════════════════════════════════════════════════
 */

const { createClient } = require('./common/mqttClient');

// ─────────────────────────────────────────────────
// [FEATURE 7] Last Will and Testament (LWT)
// If this node disconnects abnormally, the broker
// will automatically publish this "offline" message.
// ─────────────────────────────────────────────────
const client = createClient('sensor_node', {
    will: {
        topic:   'aquarium/sensor/status',
        payload: JSON.stringify({ status: 'OFFLINE', node: 'Sensor_Node', reason: 'unexpected_disconnect' }),
        qos:     1,
        retain:  true,
        properties: {
            willDelayInterval: 5   // Wait 5s before publishing LWT (in case of brief reconnect)
        }
    }
});

// Tracks whether each Topic Alias has been registered yet
const aliasRegistered = { ph: false, temperature: false };

client.on('connect', () => {
    console.log('[SENSOR_NODE] ✅ Connected | LWT registered on aquarium/sensor/status');

    // Publish ONLINE status immediately after connecting
    client.publish(
        'aquarium/sensor/status',
        JSON.stringify({ status: 'ONLINE', node: 'Sensor_Node', ts: Date.now() }),
        { qos: 1, retain: true }
    );
    console.log('[SENSOR_NODE] 📢 Online status published (retained)');

    // ─── Main sensor loop: publishes every 3 seconds ───────────────────────
    setInterval(() => {
        const ph          = parseFloat((Math.random() * 2.5 + 6.2).toFixed(2));  // 6.2 – 8.7
        const temperature = parseFloat((Math.random() * 6   + 23 ).toFixed(2));  // 23  – 29°C
        const ts          = Date.now();

        // ─────────────────────────────────────────────────────────────────
        // [FEATURE 4] User Properties (Metadata)
        // Extra key-value pairs attached to the MQTT 5.0 packet header.
        // Subscribers receive this without it polluting the JSON payload.
        // ─────────────────────────────────────────────────────────────────
        const userProperties = {
            Device_ID: 'SENSOR-001',
            Location:  'Main_Tank',
            Firmware:  'v2.1.0'
        };

        // ══════════ Publish pH ════════════════════════════════════════════
        // [FEATURE 1]  QoS 0 — fast, lightweight for high-frequency telemetry
        // [FEATURE 3]  Topic Alias — first publish registers alias 1 to the
        //              full topic name; subsequent publishes send alias 1
        //              with an empty string topic to save bandwidth.
        // [FEATURE 4]  User Properties — metadata in packet header
        if (!aliasRegistered.ph) {
            // First time: send full topic + alias to REGISTER the mapping
            client.publish(
                'aquarium/sensor/ph',
                JSON.stringify({ value: ph, unit: 'pH', ts }),
                {
                    qos: 0,
                    properties: {
                        topicAlias:     1,             // [FEATURE 3] Register alias 1
                        userProperties              // [FEATURE 4] Metadata
                    }
                }
            );
            aliasRegistered.ph = true;
            console.log(`[SENSOR_NODE] [REGISTER ALIAS 1 → aquarium/sensor/ph] pH=${ph}`);
        } else {
            // Subsequent: empty topic string + same alias number (saves bytes)
            client.publish(
                '',
                JSON.stringify({ value: ph, unit: 'pH', ts }),
                {
                    qos: 0,
                    properties: {
                        topicAlias:     1,             // [FEATURE 3] Reuse alias 1
                        userProperties              // [FEATURE 4] Metadata
                    }
                }
            );
            console.log(`[SENSOR_NODE] [USE ALIAS 1]  pH=${ph}`);
        }

        // ══════════ Publish Temperature ═══════════════════════════════════
        // [FEATURE 1]  QoS 0
        // [FEATURE 3]  Topic Alias 2
        // [FEATURE 4]  User Properties
        // [FEATURE 5]  Retain — broker keeps this as the "last known value".
        //              New subscribers immediately get the latest temperature
        //              without waiting for the next publish cycle.
        if (!aliasRegistered.temperature) {
            client.publish(
                'aquarium/sensor/temperature',
                JSON.stringify({ value: temperature, unit: 'Celsius', ts }),
                {
                    qos: 0,
                    retain: true,                      // [FEATURE 5] Retain message
                    properties: {
                        topicAlias:     2,             // [FEATURE 3] Register alias 2
                        userProperties              // [FEATURE 4] Metadata
                    }
                }
            );
            aliasRegistered.temperature = true;
            console.log(`[SENSOR_NODE] [REGISTER ALIAS 2 → aquarium/sensor/temperature] Temp=${temperature}°C [RETAINED]`);
        } else {
            client.publish(
                '',
                JSON.stringify({ value: temperature, unit: 'Celsius', ts }),
                {
                    qos: 0,
                    retain: true,                      // [FEATURE 5] Retain message
                    properties: {
                        topicAlias:     2,             // [FEATURE 3] Reuse alias 2
                        userProperties              // [FEATURE 4] Metadata
                    }
                }
            );
            console.log(`[SENSOR_NODE] [USE ALIAS 2]  Temp=${temperature}°C [RETAINED]`);
        }

        // ══════════ Publish Critical Alert ════════════════════════════════
        // Thresholds: pH outside 6.8–8.2 or temperature above 28.5°C
        const phCritical   = ph < 6.8 || ph > 8.2;
        const tempCritical = temperature > 28.5;

        if (phCritical || tempCritical) {
            const alertPayload = JSON.stringify({
                level:       'CRITICAL',
                ph,
                temperature,
                message:     phCritical
                    ? (ph < 6.8 ? 'pH too LOW! Fish at risk.' : 'pH too HIGH! Fish at risk.')
                    : 'Temperature too HIGH! Oxygen may drop.',
                ts
            });
            client.publish('aquarium/alert', alertPayload, { qos: 1 });
            console.log(`[SENSOR_NODE] ⚠️  ALERT sent → ${alertPayload}`);
        }

    }, 3000);
});

// ─── Graceful shutdown ─────────────────────────────────────────────────────
process.on('SIGINT', () => {
    console.log('\n[SENSOR_NODE] 🛑 Graceful shutdown...');
    client.publish(
        'aquarium/sensor/status',
        JSON.stringify({ status: 'OFFLINE', node: 'Sensor_Node', reason: 'graceful_shutdown', ts: Date.now() }),
        { qos: 1, retain: true },
        () => {
            console.log('[SENSOR_NODE] Goodbye!');
            client.end();
        }
    );
});
