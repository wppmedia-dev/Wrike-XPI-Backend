const { DefaultAzureCredential } = require("@azure/identity");
const { SecretClient } = require("@azure/keyvault-secrets");
const { KeyClient, CryptographyClient } = require("@azure/keyvault-keys");
require("dotenv").config();

const credential = new DefaultAzureCredential();
const vaultUrl = process.env.AZURE_VAULT_URL;

if (!vaultUrl) {
  throw new Error("AZURE_VAULT_URL environment variable is not set.");
}

const secretClient = new SecretClient(vaultUrl, credential);
const keyClient = new KeyClient(vaultUrl, credential);

// Get a CryptographyClient for a specific key
export const getKeyVaultClient = async (keyId) => {
  try {
    // If no keyId is provided, use the auth key ID from env
    const keyIdentifier = keyId || process.env.AZURE_KEY_VAULT_AUTH_KEY_ID;
    if (!keyIdentifier) {
      throw new Error("No key identifier provided");
    }

    // Create a CryptographyClient for the specific key
    return new CryptographyClient(keyIdentifier, credential);
  } catch (error) {
    console.error("Error getting key vault client:", error.message);
    throw error;
  }
};

export const getSecrets = async (secretNames) => {
  try {
    const secretValues = {};

    for (const name of secretNames) {
      try {
        const secret = await secretClient.getSecret(name);
        secretValues[secret.name] = secret.value;
      } catch (err) {
        console.error(`Failed to retrieve secret "${name}":`, err.message);
      }
    }

    return secretValues;
  } catch (err) {
    console.error("Error retrieving secrets:", err.message);
    return {};
  }
};

export const listAllSecrets = async () => {
  try {
    const secretNames = [];
    for await (const secretProperties of secretClient.listPropertiesOfSecrets()) {
      secretNames.push(secretProperties.name);
    }
    return secretNames;
  } catch (err) {
    console.error("Error listing secrets:", err.message);
    return [];
  }
};
