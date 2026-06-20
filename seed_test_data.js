const db = require('./src/models');

async function seedTestData() {
  try {
    console.log('Connecting to database...');
    await db.sequelize.authenticate();
    console.log('Database connected!');

    const transaction = await db.sequelize.transaction();

    try {
      // 1. Create a Company
      console.log('Creating Company...');
      const company = await db.Company.create({
        company_name: 'Test Bonagiri Chits Pvt Ltd',
        company_address: '123 Main Street, Test City',
        bank_name: 'HDFC Bank',
        gst_percentage: 18.00,
        enrollement_charges: 500.00,
        type: 1,
        company_email: 'admin@testcompany.com',
        company_password: 'password123'
      }, { transaction });

      // 2. Create 10 Members
      console.log('Creating Members...');
      const members = [];
      for (let i = 1; i <= 10; i++) {
        const member = await db.Member.create({
          company_id: company.id,
          name: `Test Member ${i}`,
          phone: `99999999${i.toString().padStart(2, '0')}`,
          role: 2, // Assuming 2 is customer/subscriber
          status: 0,
          email: `member${i}@test.com`,
          other_info_user_code: 100000 + i,
          other_info_user_password: 'password123'
        }, { transaction });
        members.push(member);
      }

      // 3. Create a Chits Group
      console.log('Creating Chits Group...');
      const chitsGroup = await db.ChitsGroup.create({
        company_id: company.id,
        group_name: 'Super Saver Test Chit 20M',
        chit_series_term: 20,
        auction_type: 1,
        chit_amount: 100000.00,
        no_of_installments: 20,
        installment_amount: 5000.00,
        chits_group_status: 1, // Started
        commencement_date: new Date(new Date().setMonth(new Date().getMonth() - 6)),
        chit_start_date: new Date(new Date().setMonth(new Date().getMonth() - 6)),
      }, { transaction });

      // 4. Create Enrollments (20 total, 2 per member so "same user same chit group")
      console.log('Creating Enrollments...');
      const enrollments = [];
      let positionNumber = 1;
      for (const member of members) {
        // 2 Enrollments per member
        for (let j = 0; j < 2; j++) {
          const enrollment = await db.Enrollment.create({
            company_id: company.id,
            group_id: chitsGroup.id,
            subscriber_id: member.id,
            group_position_number: positionNumber++,
            status: 1, // Active
            delete_status: 0
          }, { transaction });
          enrollments.push(enrollment);
        }
      }

      // 5. Create Installments, Auctions, and Payments for 6 months (completed) and 14 months (upcoming)
      console.log('Creating Installments, Auctions and Payments...');
      const startDate = new Date(new Date().setMonth(new Date().getMonth() - 6));
      
      for (let monthNo = 1; monthNo <= 20; monthNo++) {
        const isCompleted = monthNo <= 6;
        const dueDate = new Date(startDate);
        dueDate.setMonth(startDate.getMonth() + monthNo);

        // If completed month, create an Auction
        if (isCompleted) {
          const winnerEnrollment = enrollments[monthNo % enrollments.length]; // Pick a winner
          await db.Auction.create({
            company_id: company.id,
            group_id: chitsGroup.id,
            auction_number: monthNo,
            auction_date: dueDate,
            bid_amount: 20000.00 + (monthNo * 1000), // dummy bid
            dividend_amount: 1000.00,
            bidder_id: winnerEnrollment.subscriber_id,
            status: 2, // completed
          }, { transaction });
        }

        // Create installments for all 20 enrollments
        for (const enrollment of enrollments) {
          const installment = await db.ChitsInstallment.create({
            company_id: company.id,
            enrollment_id: enrollment.id,
            installment_no: monthNo,
            type: 1,
            due_date: dueDate.toISOString().split('T')[0],
            payable_amount: 5000.00 - (isCompleted ? 1000.00 : 0), // Minus dividend if completed
            penalty_amount: 0.00,
            status: isCompleted ? 1 : 0
          }, { transaction });

          // If completed, create customer payment marking it as paid
          if (isCompleted) {
            await db.CustomerPayment.create({
              company_id: company.id,
              customer_id: enrollment.subscriber_id,
              chits_installment_id: installment.id,
              group_id: chitsGroup.id,
              payment_status: 1, // Paid
              payment_date: dueDate,
              payment_type: 1, // Cash or online
              received_amount: installment.payable_amount
            }, { transaction });
          }
        }
      }

      await transaction.commit();
      console.log('Test data generated successfully!');
      console.log('====================================');
      console.log('COMPANY LOGIN:');
      console.log(`User Code (company_id): ${company.company_id}`);
      console.log(`Password: password123`);
      console.log('------------------------------------');
      console.log('MEMBER LOGINS:');
      console.log(`User Code (other_info_user_code): 100001 to 100010`);
      console.log(`Password: password123`);
      console.log('====================================');
      console.log('- 1 Company');
      console.log('- 10 Members');
      console.log('- 1 Chits Group (20 installments)');
      console.log('- 20 Enrollments (2 positions per member)');
      console.log('- 6 Months of completed auctions & payments');
      console.log('- 14 Months of pending installments');
    } catch (err) {
      await transaction.rollback();
      throw err;
    }

  } catch (error) {
    console.error('Error generating test data:', error);
  } finally {
    process.exit();
  }
}

seedTestData();
