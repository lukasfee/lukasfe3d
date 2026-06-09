# Security Specification for ERP Industrial

## 1. Data Invariants
- A sale must have a valid paymentMethodId.
- A sale cannot be created if the cashier is not open.
- Product stock can only be modified by specific actions (sale, manual update).
- Cashier sessions must have an openingTime.
- Financial transactions must belong to a valid origin if specified.

## 2. The "Dirty Dozen" Payloads
1. **Identity Spoofing**: Attempt to create a product with someone else's UID (if we had specific ownership).
2. **Identity Spoofing**: Attempt to update a sale status without being authenticated.
3. **State Shortcutting**: Attempt to close a cashier session that is already closed.
4. **State Shortcutting**: Attempt to update a sale status to 'finalizado' directly from 'aguardando_separacao'.
5. **Resource Poisoning**: Use a 2KB string for a product ID.
6. **Resource Poisoning**: Inject a huge array into a sale's items.
7. **Bypassing Invariants**: Create a sale with a negative total.
8. **Bypassing Invariants**: Update a product stock to a negative value without an authorized role.
9. **Role Escalation**: Attempt to delete a product (soft delete) as a non-authenticated user.
10. **Role Escalation**: Attempt to modify financial transactions as a regular user.
11. **PII Leakage**: Attempt to read all clients' private info without being an admin/authorized.
12. **System Injection**: Attempt to manually modify `executionsCount` on an automation.

## 3. The Test Runner
To be implemented in `firestore.rules.test.ts`.
