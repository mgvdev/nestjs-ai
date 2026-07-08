import { Injectable } from '@nestjs/common';
import type {
  ApprovalContext,
  ApprovalGate,
} from './approval-gate.interface.js';

/** Default gate: approves every request. */
@Injectable()
export class AutoApproveGate implements ApprovalGate {
  async requestApproval(_context: ApprovalContext): Promise<boolean> {
    return true;
  }
}

/** Gate that denies every request (useful to hard-block approval tools). */
@Injectable()
export class DenyApproveGate implements ApprovalGate {
  async requestApproval(_context: ApprovalContext): Promise<boolean> {
    return false;
  }
}
