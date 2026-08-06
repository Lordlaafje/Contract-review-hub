import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground',
        muted: 'border-transparent bg-muted text-muted-foreground',
        // Risk tiers — semantic, and the same everywhere they appear.
        low: 'border-transparent bg-risk-lowbg text-risk-low',
        medium: 'border-transparent bg-risk-medbg text-risk-med',
        high: 'border-transparent bg-risk-highbg text-risk-high',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

// forwardRef so it can be the child of asChild triggers (Tooltip, Popover…).
const Badge = React.forwardRef(({ className, variant, ...props }, ref) => (
  <div ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
));
Badge.displayName = 'Badge';

export { Badge, badgeVariants };
