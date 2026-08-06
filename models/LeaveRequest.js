module.exports = (sequelize, DataTypes) => {
  const LeaveRequest = sequelize.define('LeaveRequest', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    start_date: { type: DataTypes.DATEONLY, allowNull: false },
    end_date: { type: DataTypes.DATEONLY, allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.ENUM('pending', 'approved', 'rejected', 'cancelled'), defaultValue: 'pending' },
    approved_by: DataTypes.INTEGER.UNSIGNED,
    approved_at: DataTypes.DATE,
    rejection_reason: DataTypes.TEXT,
  }, { tableName: 'leave_requests' });

  LeaveRequest.associate = (models) => {
    LeaveRequest.belongsTo(models.Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
  };

  return LeaveRequest;
};
