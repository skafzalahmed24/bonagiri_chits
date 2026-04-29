'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Auction extends Model {
    static associate(models) {
      Auction.belongsTo(models.ChitsGroup, { foreignKey: 'group_id', as: 'group' });
      Auction.belongsTo(models.Member, { foreignKey: 'bidder_id', as: 'bidder' });
    }
  }
  
  Auction.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    company_id: DataTypes.UUID,
    group_id: DataTypes.UUID,
    ticket_number: DataTypes.INTEGER,
    bidder_id: DataTypes.INTEGER,
    auction_number: DataTypes.INTEGER,
    auction_date: DataTypes.DATEONLY,
    due_date: DataTypes.DATEONLY,
    next_auction_date: DataTypes.DATEONLY,
    bid_amount: DataTypes.DECIMAL(15, 2),
    gst_number_percentage: DataTypes.DECIMAL(5, 2),
    pb_bo_proxy: DataTypes.STRING,
    minutes_filing_date: DataTypes.DATEONLY,
    installments: DataTypes.INTEGER,
    chit_amount: DataTypes.DECIMAL(15, 2),
    bid_loss: DataTypes.DECIMAL(15, 2),
    bid_payable: DataTypes.DECIMAL(15, 2),
    company_commission: DataTypes.DECIMAL(15, 2),
    gst_amount: DataTypes.DECIMAL(15, 2),
    dividend_payable: DataTypes.DECIMAL(15, 2),
    subscription_amount: DataTypes.DECIMAL(15, 2),
    dividend: DataTypes.DECIMAL(15, 2),
    net_payable: DataTypes.DECIMAL(15, 2)
  }, {
    sequelize,
    modelName: 'Auction',
    tableName: 'auctions'
  });
  
  return Auction;
};
