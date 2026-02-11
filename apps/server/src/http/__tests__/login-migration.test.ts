import { sha256 } from '@sharkord/shared';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { initTest, login } from '../../__tests__/helpers';
import { tdb } from '../../__tests__/setup';
import { roles, userRoles, users } from '../../db/schema';

describe('login', () => {
  test('should succeed with legacy SHA256 password and auto-upgrade to Argon2id', async () => {
    const identity = 'legacyuser';
    const plainPassword = 'legacypassword123';
    const legacyHash = await sha256(plainPassword);

    // Insert user with legacy SHA256 hash
    await tdb.insert(users).values({
      identity,
      name: 'Legacy User',
      password: legacyHash,
      createdAt: Date.now()
    });

    // Attempt login
    const response = await login(identity, plainPassword);

    expect(response.status).toBe(200);

    const data = (await response.json()) as { success: boolean; token: string };
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('token');

    // Verify password was upgraded to Argon2id
    const updatedUser = tdb
      .select()
      .from(users)
      .where(eq(users.identity, identity))
      .get();

    expect(updatedUser).toBeTruthy();
    expect(updatedUser!.password).toStartWith('$argon2');
    expect(updatedUser!.password).not.toBe(legacyHash);
  });

  test('should fail login with incorrect password against legacy hash', async () => {
    const identity = 'legacyuser2';
    const correctPassword = 'correctpass';
    const wrongPassword = 'wrongpass';
    const legacyHash = await sha256(correctPassword);

    // Insert user with legacy SHA256 hash
    await tdb.insert(users).values({
      identity,
      name: 'Legacy User 2',
      password: legacyHash,
      createdAt: Date.now()
    });

    // Attempt login with wrong password
    const response = await login(identity, wrongPassword);

    expect(response.status).toBe(400);

    const data: any = await response.json();
    expect(data).toHaveProperty('errors');
    expect(data.errors).toHaveProperty('password', 'Invalid password');

    // Verify password was NOT upgraded (since login failed)
    const user = tdb
      .select()
      .from(users)
      .where(eq(users.identity, identity))
      .get();

    expect(user).toBeTruthy();
    expect(user!.password).toBe(legacyHash); // Still legacy hash
  });

  test('should allow password update with legacy SHA256 password', async () => {
    const identity = 'legacyuser3';
    const oldPassword = 'oldlegacypass';
    const newPassword = 'newstrongpass';
    const legacyHash = await sha256(oldPassword);

    // Insert user with legacy SHA256 hash
    const [insertedUser] = await tdb
      .insert(users)
      .values({
        identity,
        name: 'Legacy User 3',
        password: legacyHash,
        createdAt: Date.now()
      })
      .returning();

    // Assign default role to the user
    const defaultRole = tdb
      .select()
      .from(roles)
      .where(eq(roles.isDefault, true))
      .get();

    await tdb.insert(userRoles).values({
      userId: insertedUser!.id,
      roleId: defaultRole!.id,
      createdAt: Date.now()
    });

    // Initialize test session for this user
    const { caller } = await initTest(insertedUser!.id);

    // Update password
    await caller.users.updatePassword({
      currentPassword: await sha256(oldPassword),
      newPassword: await sha256(newPassword),
      confirmNewPassword: await sha256(newPassword)
    });

    // Verify password was upgraded to Argon2id
    const updatedUser = tdb
      .select()
      .from(users)
      .where(eq(users.identity, identity))
      .get();

    expect(updatedUser).toBeTruthy();
    expect(updatedUser!.password).toStartWith('$argon2');
    expect(updatedUser!.password).not.toBe(legacyHash);

    // Verify can login with new password
    const loginResponse = await login(identity, newPassword);
    expect(loginResponse.status).toBe(200);
  });
});
