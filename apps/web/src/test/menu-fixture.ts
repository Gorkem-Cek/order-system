import type { MenuResponse } from "@siparis/shared";

// A small menu used by web tests. Ids are valid cuids because the API schemas check them.
export const ids = {
  hot: "cmhot00000000000000000001",
  desserts: "cmdes00000000000000000001",
  cay: "cmcay00000000000000000001",
  latte: "cmlat00000000000000000001",
  brownie: "cmbro00000000000000000001",
  sizeGroup: "cmgsz00000000000000000001",
  small: "cmosm00000000000000000001",
  large: "cmolg00000000000000000001",
  extrasGroup: "cmgex00000000000000000001",
  shot: "cmosh00000000000000000001",
  caramel: "cmoca00000000000000000001",
};

export const menuFixture: MenuResponse = {
  cafe: {
    name: "Demo Kafe",
    slug: "demo-kafe",
    logoUrl: null,
    coverUrl: null,
    primaryColor: "#7c4a2d",
  },
  table: { name: "Masa 5" },
  categories: [
    {
      id: ids.hot,
      name: "Sıcak İçecekler",
      products: [
        {
          id: ids.cay,
          name: "Çay",
          description: "İnce belli bardakta.",
          priceKurus: 4000,
          imageUrl: null,
          isAvailable: true,
          optionGroups: [],
        },
        {
          id: ids.latte,
          name: "Latte",
          description: null,
          priceKurus: 16000,
          imageUrl: null,
          isAvailable: true,
          optionGroups: [
            {
              id: ids.sizeGroup,
              name: "Boyut",
              minSelect: 1,
              maxSelect: 1,
              options: [
                { id: ids.small, name: "Küçük", priceDeltaKurus: 0, isAvailable: true },
                { id: ids.large, name: "Büyük", priceDeltaKurus: 4000, isAvailable: true },
              ],
            },
            {
              id: ids.extrasGroup,
              name: "Ekstralar",
              minSelect: 0,
              maxSelect: 2,
              options: [
                { id: ids.shot, name: "Ekstra shot", priceDeltaKurus: 3500, isAvailable: true },
                {
                  id: ids.caramel,
                  name: "Karamel şurubu",
                  priceDeltaKurus: 2000,
                  isAvailable: false,
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: ids.desserts,
      name: "Tatlılar",
      products: [
        {
          id: ids.brownie,
          name: "Brownie",
          description: null,
          priceKurus: 15000,
          imageUrl: null,
          isAvailable: false,
          optionGroups: [],
        },
      ],
    },
  ],
};
