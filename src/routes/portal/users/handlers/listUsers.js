import { Users } from "../../../../controllers";

export const ListUsers = () => {
  return new Promise(async (resolve, reject) => {
    try {
      const users = await Users.GetAll();

      const data = users.map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        full_name: u.full_name,
        email: u.email,
        is_active: u.is_active,
        must_change_password: u.must_change_password,
        last_login_at: u.last_login_at,
        created_at: u.created_at,
      }));

      return resolve({
        statusCode: 200,
        message: "Users retrieved",
        data,
      });
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};
