// ── Roles ──

export type Role = 'super_admin' | 'admin' | 'client_visu'

// ── Auth ──

export interface User {
  id: string
  username: string
  email: string
  role: Role
  is_active: boolean
  created_at: string
  tenant_assignments: TenantAssignment[]
}

export interface TenantAssignment {
  id: string
  tenant_id: string
  tenant_name: string
  server_url: string
  server_api_token: string
  allowed_application_ids: string[]
  created_at: string
}

export interface ClientConnection {
  tenant_id: string
  tenant_name: string
  server_url: string
  server_api_token: string
  allowed_application_ids: string[]
}

export interface LoginRequest {
  username: string
  password: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  user: User
}

// ── ChirpStack Entities ──

export interface ChirpStackServer {
  id: string
  name: string
  url: string
  api_token: string
  created_at: string
}

export interface Tenant {
  id: string
  name: string
  description: string
}

export interface Application {
  id: string
  name: string
  description: string
  tenantId: string
}

export interface DeviceProfile {
  id: string
  name: string
  tenantId: string
}

export interface Device {
  devEui: string
  name: string
  description: string
  applicationId: string
  deviceProfileId: string
  deviceProfileName: string
  tags: Record<string, string>
  lastSeenAt: string | null
  createdAt: string
}

export interface DeviceKeys {
  devEui: string
  nwkKey: string
  appKey: string
}

export interface LinkMetrics {
  datasets: Array<{
    label: string
    data: Record<string, number>
  }>
  timestamps: string[]
}

// ── Device Events (SSE) ──

export interface DeviceEvent {
  type: string           // 'up', 'join', 'ack', 'log', 'status', 'txack'
  time: string
  deduplicationId?: string
  // Uplink fields (type === 'up')
  devAddr?: string
  dr?: number
  fCnt?: number
  fPort?: number
  confirmed?: boolean
  data?: string          // base64 raw payload
  object?: unknown       // decoded payload from codec
  rxInfo?: Array<{
    gatewayId: string
    rssi: number
    snr: number
    channel?: number
    location?: { latitude: number; longitude: number }
  }>
  txInfo?: {
    frequency: number
    modulation?: unknown
  }
}

// ── Import ──

export interface ImportProfile {
  id: string
  name: string
  required_tags: string[]
  tag_values: Record<string, string>
  device_profile: Record<string, string>
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ImportRow {
  [key: string]: string
}

export interface ImportMapping {
  name: string | null
  dev_eui: string | null
  description: string | null
  device_profile_id: string | null
  app_key: string | null
}

export interface ImportError {
  row: number
  devEui: string
  name: string
  error: string
  type: string
}

// ── Bulk Operation ──

export type DeviceStatus = 'active' | 'recent' | 'inactive' | 'offline' | 'never'

export interface BulkOperationConfig<TContext = void> {
  /** Label shown during loading */
  loadingLabel: string
  /** Label shown during execution */
  executionLabel: string
  /** Table columns to display */
  columns: BulkColumn[]
  /** Validation before execution. Return error string or null. */
  validate?: (context: TContext) => string | null
  /** Confirmation message. Return null to skip. */
  confirmMessage?: (count: number, context: TContext) => string | null
  /** Execute action on a single device. Return log entry. */
  executeOne: (device: Device, context: TContext) => Promise<BulkLogEntry>
  /** Called after all operations complete */
  onComplete?: (results: BulkResults) => void
}

export interface BulkColumn {
  key: string
  label: string
  render?: (device: Device) => string
  mono?: boolean
  copyable?: boolean
}

export interface BulkLogEntry {
  status: 'success' | 'error' | 'warning' | 'info'
  message: string
}

export interface BulkResults {
  total: number
  success: number
  errors: number
}

// ── Analyze ──

export interface AnalyzeStats {
  total: number
  active: number
  recent: number
  inactive: number
  offline: number
  never: number
  byProfile: Record<string, number>
}

export interface MetricData {
  label: string
  values: number[]
  timestamps: string[]
  total: number
  avg: number
}

export interface DeviceMetricsEntry {
  status: 'loading' | 'loaded' | 'error'
  states: Record<string, { name: string; value: string }>
  metrics: Record<string, MetricData>
}
