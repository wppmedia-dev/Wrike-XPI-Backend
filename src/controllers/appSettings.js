import models from "../../models";

/** One setting's stored value, or null when it was never set. */
export const Get = async (key) => {
  const row = await models.AppSettings.findByPk(key);
  return row ? row.value : null;
};

/** Several settings at once, as { key: value } with only the keys that exist. */
export const GetMany = async (keys) => {
  const { Op } = models.Sequelize;
  const rows = await models.AppSettings.findAll({
    where: { key: { [Op.in]: keys } },
  });
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
};

/** Write one setting. `adminId` is the admin_users row that changed it. */
export const Set = async (key, value, adminId = null) => {
  await models.AppSettings.upsert({
    key,
    value,
    updated_by: adminId,
    updated_at: new Date(),
  });
};
