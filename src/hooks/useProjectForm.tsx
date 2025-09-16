
// hooks/useProjectForm.ts - Helper hook for form validation
import { useState } from 'react';
import { z } from 'zod';
import { CreateProjectDataSchema, UpdateProjectDataSchema } from '../types/project';

export function useProjectFormValidation() {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateCreateProject = (data: any) => {
    try {
      CreateProjectDataSchema.parse(data);
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.issues.forEach(issue => {
          const path = issue.path.join('.');
          newErrors[path] = issue.message;
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const validateUpdateProject = (data: any) => {
    try {
      UpdateProjectDataSchema.parse(data);
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.issues.forEach(issue => {
          const path = issue.path.join('.');
          newErrors[path] = issue.message;
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const clearErrors = () => setErrors({});

  const getFieldError = (fieldName: string) => errors[fieldName];

  return {
    errors,
    validateCreateProject,
    validateUpdateProject,
    clearErrors,
    getFieldError,
  };
}