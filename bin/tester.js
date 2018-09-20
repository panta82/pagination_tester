const { Client } = require('pg');

const { Options } = require('../lib/options');
const { UserStore, Criteria } = require('../lib/user_store');

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

  const userStore = new UserStore(client);

  return client
    .connect()
    .then(() => {
      console.log('Testing V1...');
      return testV1(1);
    })
    .finally(() => {
      console.log(`Done`);
      return client.end();
    });

  function testV1(page = 1) {
    const criteria = new Criteria({ page });
    const startedAt = new Date();
    return userStore.listV1(criteria).then(result => {
      const elapsed = new Date() - startedAt;
      console.log(`    Page ${page}: ${(elapsed / 1000).toFixed(2)} sec`);
      if (page < result.total_pages) {
        return testV1(page + 1);
      }
    });
  }
}
