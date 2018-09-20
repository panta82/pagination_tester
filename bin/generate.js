const { Client } = require('pg');
const Chance = require('chance');

const { Options } = require('../lib/options');
const { Generator } = require('../lib/generator');

main().catch(err => {
  console.error(err);
  process.exit(1);
});

function main() {
  const options = new Options();
  options.loadFromEnv();

  const count = Number(process.argv[2]) || 50;

  const client = new Client({
    user: options.pg_user,
    host: options.pg_host,
    database: options.pg_database,
    password: options.pg_password,
    port: options.pg_port,
  });

  const chance = new Chance();

  const generator = new Generator(client, chance);

  return client
    .connect()
    .then(() => {
      return generator.migrate();
    })
    .then(() => {
      console.log(`Generating ${count} records`);
      return generator.generateData(count);
    })
    .finally(() => {
      console.log(`Done`);
      return client.end();
    });
}
