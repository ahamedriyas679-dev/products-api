const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "products-api-"));
process.env.DB_SOURCE = path.join(testDirectory, "test.sqlite");

const app = require("../server");
const database = require("../database");
let server;
let baseUrl;

before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${baseUrl}/api/products`);
            if (response.ok) return;
        } catch (error) {
            // The SQLite connection may not be ready yet.
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
    }

    throw new Error("The API database did not initialize in time.");
});

after(async () => {
    if (server) {
        await new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
    }
    await new Promise((resolve, reject) => {
        database.close((error) => error ? reject(error) : resolve());
    });
    fs.rmSync(testDirectory, { recursive: true, force: true });
});

test("customer registration and product filters", async (t) => {
    await t.test("product filters return arrays", async () => {
        for (const route of ["/api/products/quantity/0", "/api/products/unitPrice/0"]) {
            const response = await fetch(`${baseUrl}${route}`);
            assert.equal(response.status, 200);
            assert.ok(Array.isArray((await response.json()).data));
        }
    });

    await t.test("valid customer gets a generated ID", async () => {
        const response = await fetch(`${baseUrl}/api/customer`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "ahamed",
                email: "ahamed@example.com",
                cardNumber: "123456789123"
            })
        });
        const result = await response.json();
        assert.equal(response.status, 201);
        assert.ok(Number.isInteger(result.customerId));
    });

    await t.test("invalid email and card number are rejected", async () => {
        const invalidCustomers = [
            { name: "ahamed", email: "invalid", cardNumber: "123456789123" },
            { name: "ahamed", email: "ahamed@example.com", cardNumber: "123" }
        ];

        for (const customer of invalidCustomers) {
            const response = await fetch(`${baseUrl}/api/customer`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(customer)
            });
            assert.equal(response.status, 400);
        }
    });

    await t.test("malformed JSON receives a JSON 400 response", async () => {
        const response = await fetch(`${baseUrl}/api/customer`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{"
        });
        assert.equal(response.status, 400);
        assert.match(response.headers.get("content-type"), /application\/json/);
    });
});