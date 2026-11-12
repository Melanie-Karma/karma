export type Zone = {
  id: string;
  name: string;
  slug: string;
  unlock_threshold: number;
  is_unlocked: boolean;
  member_count: number;
};

export type OwnProfile = {
  id: string;
  username: string | null;
  referral_code: string;
  referral_count: number;
  referred_by: string | null;
  founder_aura: boolean;
  animal_stage: number;
  zone_id: string | null;
};

export const ZONE_COLUMNS = "id,name,slug,unlock_threshold,is_unlocked,member_count";
export const REF_STORAGE_KEY = "karma_ref";
export const REFERRALS_FOR_FOUNDER = 3;
