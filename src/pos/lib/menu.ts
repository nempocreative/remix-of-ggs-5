export type Service = {
  id: string;
  name: string;
  category: string;
  minPrice: number;
  maxPrice?: number;
  priceType: 'fixed' | 'range' | 'starting';
};

export type SalonId = 'beauty' | 'hair-studio';

export const salonDetails: Record<SalonId, { name: string; descriptor: string; tabLabel: string }> = {
  beauty: { name: 'GGS Beauty', descriptor: 'SALON & BEAUTY', tabLabel: 'Perempuan' },
  'hair-studio': { name: 'GGS Hair Studio', descriptor: 'HAIR STUDIO', tabLabel: 'Laki-laki' },
};
