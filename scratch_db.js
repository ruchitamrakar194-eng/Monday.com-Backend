const { sequelize, Payroll } = require('./models');

async function test() {
  try {
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');
    const records = await Payroll.findAll();
    console.log('Payroll records in DB:', JSON.stringify(records, null, 2));
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  } finally {
    await sequelize.close();
  }
}

test();
