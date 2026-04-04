import { Router } from "express";
import { z } from "zod";
import {
  bulkCreateEmployees,
  createEmployee,
  deleteEmployee,
  listEmployees,
  updateEmployee
} from "../repositories/employeeRepository";

const pinSchema = z.string().trim().regex(/^\d{4}(?:\d{2})?$/, "PIN must be 4 or 6 digits.");
const teamSchema = z.enum(["C-OPS", "F-OPS"]);

const employeeSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().trim().email(),
  role: z.enum(["employee", "trainer"]).optional().default("employee"),
  team: teamSchema.optional().default("C-OPS"),
  pin: pinSchema.optional()
});

const updateSchema = z.object({
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  role: z.enum(["employee", "trainer"]).optional(),
  team: teamSchema.optional(),
  pin: pinSchema.optional()
});

const bulkSchema = z.object({
  employees: z.array(z.object({
    firstName: z.string().trim().min(1).optional(),
    lastName: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    email: z.string().trim().email(),
    role: z.enum(["employee", "trainer"]).optional(),
    team: teamSchema.optional()
  }).refine((employee) => Boolean((employee.firstName && employee.lastName) || employee.name), {
    message: "Either firstName/lastName or name is required."
  }))
});

export function createEmployeeRouter(): Router {
  const router = Router();

  router.get("/", (_request, response) => {
    response.json(listEmployees());
  });

  router.post("/", async (request, response, next) => {
    try {
      const parsed = employeeSchema.parse(request.body);
      const employee = await createEmployee(parsed);
      response.status(201).json(employee);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id", async (request, response, next) => {
    try {
      const parsed = updateSchema.parse(request.body);
      const employee = await updateEmployee(request.params.id, parsed);
      response.json(employee);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", async (request, response, next) => {
    try {
      await deleteEmployee(request.params.id);
      response.json({ message: "Employee deleted." });
    } catch (error) {
      next(error);
    }
  });

  router.post("/bulk", async (request, response, next) => {
    try {
      const parsed = bulkSchema.parse(request.body);
      const result = await bulkCreateEmployees(parsed.employees);
      response.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}