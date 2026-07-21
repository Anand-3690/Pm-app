export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
};

export type Project = {
  id: string;
  title: string;
  description: string | null;
  status: 'active' | 'on_hold' | 'completed' | 'archived';
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type ProjectMember = {
  id: string;
  project_id: string;
  user_id: string;
  role: 'admin' | 'member';
  joined_at: string;
  profiles?: Profile;
};

export type Task = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignee_id: string | null;
  due_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  assignee?: Profile;
};

export type Message = {
  id: string;
  task_id: string;
  sender_id: string;
  content: string | null;
  attachment_url: string | null;
  attachment_type: 'image' | 'file' | null;
  reply_to_id: string | null;
  status: 'sent' | 'delivered' | 'read';
  created_at: string;
  sender?: Profile;
  reply_to?: Message;
};
