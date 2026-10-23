// Test-only preload: JSON fixture data never becomes executable source.
const response = JSON.parse(process.env.UI_MAINTENANCE_TEST_RESPONSE);
delete process.env.UI_MAINTENANCE_TEST_RESPONSE;
globalThis.fetch = async () => Response.json(response);
