export interface Category {
  id: number;
  name: string;
}

export interface Product {
  id: number;
  name: string;
  price: number;
  stock: number;
  category: Category;
}

export interface SaleDetail {
  id: number;
  quantity: number;
  unitPrice: number;
  product: Product;
}

export interface Sale {
  id: number;
  total: number;
  createdAt: string;
  user: { email: string };
  details: SaleDetail[];
}

export type PageId =
  | 'punto-de-venta'
  | 'facturacion'
  | 'articulos'
  | 'stock-listado'
  | 'alquiler'
  | 'servicios-tecnicos'
  | 'configuracion';
