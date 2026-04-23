/**
 * 唐闸古镇工业遗存示范数据（经纬度为示意值，可替换为精确测绘成果或 3D Tiles 服务）
 * 名称与类型参考公开资料中的近代工业遗存要素。
 * indicators：可与后端/API 对齐的扩展字段（当前界面仅展示基本介绍）。
 */
/** 类型 → 点符号颜色（类论文中“按属性唯一值渲染”） */
export const categoryPointColors = {
  工业生产遗存: "#e11d48",
  交通与物流遗存: "#0284c7",
  "历史文化街区与生活服务": "#9333ea",
  活化利用与展示片区: "#16a34a",
};

export const initialCamera = {
  longitude: 120.8564,
  latitude: 32.0492,
  height: 2800,
  heading: 0,
  pitch: -Math.PI / 4,
  roll: 0,
};

export const heritageCategories = [
  "工业生产遗存",
  "交通与物流遗存",
  "历史文化街区与生活服务",
  "活化利用与展示片区",
];

export const heritageSites = [
  {
    id: "dasheng-mill",
    name: "大生纱厂旧址",
    category: "工业生产遗存",
    era: "清末—民国",
    address: "南通市唐闸片区（示意）",
  image: "/src/assets/dasheng-mill.svg",
    protection: "全国重点文物保护单位（大生纱厂相关建筑群组成部分，示意）",
    indicators: { history: 5, integrity: 4, reuse: 4 },
    lon: 120.805860123,
    lat: 32.065536783,
    height: 12,
    summary:
      "张謇创办的大生纱厂是唐闸近代工业的核心遗存之一，厂区内的钟楼、公事厅、清花间等建筑具有典型近代工业建筑特征，是展示“实业救国”与南通近代工业史的重要空间载体。",
  },
  {
    id: "clock-tower",
    name: "大生钟楼",
    category: "工业生产遗存",
    era: "近代",
    address: "大生纱厂厂区内（示意）",
    protection: "与纱厂建筑群一体保护（示意）",
  image: "/src/assets/clock-tower.svg",
    indicators: { history: 5, integrity: 5, reuse: 4 },
    lon: 120.80606462,
    lat: 32.065398273,
    height: 28,
    summary:
      "大生纱厂标志性构筑物，兼具报时与景观功能，在古镇天际线中识别度高，适合作为三维场景中的地标锚点与叙事节点。",
  },
  {
    id: "guangsheng-oil",
    name: "广生油厂旧址",
    category: "工业生产遗存",
    era: "近代",
    address: "唐闸河东路北侧（示意）",
    image: "/src/assets/广生油厂旧址.png",
    protection: "工业遗存登录 / 改造利用（示意）",
    indicators: { history: 4, integrity: 3, reuse: 5 },
    lon: 120.803293541,
    lat: 32.06712479,
    height: 10,
    summary:
      "广生油厂等遗存经保护利用后融入文化创意与体验功能（如制皂文化体验），体现工业建筑适应性再利用路径，可在系统中以属性字段区分“原功能 / 现利用”。",
  },
  {
    id: "park-1895",
    name: "1895 文化创意产业园",
    category: "活化利用与展示片区",
    era: "当代（基于工业遗存改造）",
    address: "唐闸河东路 1895 片区（示意）",
    image: "/src/assets/1895 文化创意产业园.png",
    protection: "保护与再利用示范片区（示意）",
    indicators: { history: 4, integrity: 3, reuse: 5 },
    lon: 120.802640288,
    lat: 32.066352758,
    height: 10,
    summary:
      "在广生油厂、造纸厂等旧址基础上形成的文创园区，是工业遗存与文旅、展示功能结合的代表性片区，可作为场景分区或专题图层管理对象。",
  },
  {
    id: "fuxing-flour",
    name: "复兴面粉厂旧址",
    category: "工业生产遗存",
    era: "近代",
    address: "唐闸镇区（示意）",
    image: "/src/assets/复兴面粉厂旧址.png",
    protection: "历史建筑 / 工业遗存（示意）",
    indicators: { history: 4, integrity: 3, reuse: 3 },
    lon: 120.80448701,
    lat: 32.057986721,
    height: 10,
    summary:
      "与大生系企业群相关的面粉加工遗存，反映唐闸地区完整的轻工业链条，可在三维属性库中关联产业链、人物与历史事件。",
  },
  {
    id: "zisheng-iron",
    name: "资生铁冶厂旧址",
    category: "工业生产遗存",
    era: "近代",
    address: "唐闸片区（示意）",
    image: "/src/assets/资生铁冶厂旧址.png",
    protection: "工业遗存（示意）",
    indicators: { history: 4, integrity: 2, reuse: 2 },
    lon: 120.804110545,
    lat: 32.066287767,
    height: 10,
    summary:
      "体现唐闸由纺织向冶金等门类延伸的工业格局，建筑体量与结构形式与纺织车间不同，适合作为多类型工业建筑模型分类展示样例。",
  },
  {
    id: "dada-steamship",
    name: "大达内河轮船公司旧址",
    category: "交通与物流遗存",
    era: "近代",
    address: "通扬运河沿岸（示意）",
    image: "/src/assets/大达内河轮船公司旧址.jpg",
    protection: "文物保护线索（示意）",
    indicators: { history: 4, integrity: 3, reuse: 3 },
    lon: 120.802159309,
    lat: 32.068311158,
    height: 8,
    summary:
      "与运河运输、物资集散相关的交通类工业遗存，可与水系、码头等矢量或模型数据叠加，支撑“运河—工厂—市镇”空间叙事。",
  },
  {
    id: "dada-rice",
    name: "大达公电碾米公司旧址",
    category: "工业生产遗存",
    era: "近代",
    address: "唐闸片区（示意）",
    image: "/src/assets/大达公电碾米公司旧址.png",
    protection: "改造利用类遗存（示意）",
    indicators: { history: 3, integrity: 3, reuse: 4 },
    lon: 120.802199657,
    lat: 32.068071441,
    height: 10,
    summary:
      "粮食加工类工业建筑，经改造后常承载活字印刷等文化体验功能，展示同一物质空间在不同历史阶段的用途变迁。",
  },
  {
    id: "dasheng-wharf",
    name: "大生码头",
    category: "交通与物流遗存",
    era: "近代",
    address: "运河码头带（示意）",
    image: "/src/assets/大生码头.jpg",
    protection: "景观与遗产廊道节点（示意）",
    indicators: { history: 5, integrity: 3, reuse: 4 },
    lon: 120.806223614,
    lat: 32.065693593,
    height: 5,
    summary:
      "水陆联运节点，连接生产与市场，是工业遗存与运河文化线路联动的关键地理要素。",
  },
  {
    id: "tangjia-lane",
    name: "汤家巷历史文化街区",
    category: "历史文化街区与生活服务",
    era: "近代—当代",
    address: "汤家巷一带（示意）",
    image: "/src/assets/汤家巷历史文化街区.png",
    protection: "历史文化街区（示意）",
    indicators: { history: 4, integrity: 4, reuse: 4 },
    lon: 120.804901713,
    lat: 32.064805081,
    height: 10,
    summary:
      "工人生活与商业服务设施集中的历史街区，可与工厂片区形成“生产—生活”对景，在三维场景中作为纹理细节丰富、步行尺度友好的子区域。",
  },
  {
    id: "beishi",
    name: "唐闸北市景区",
    category: "活化利用与展示片区",
    era: "当代（基于历史市场改造）",
    address: "唐闸北市片区（示意）",
    image: "/src/assets/唐闸北市景区.png",
    protection: "商业文旅改造片区（示意）",
    indicators: { history: 3, integrity: 3, reuse: 5 },
    lon: 120.800129416,
    lat: 32.068480974,
    height: 10,
    summary:
      "由原菜市场等生活配套建筑改造而成的商业游览区，体现工业社区遗存向公共文化消费空间转化的路径。",
  },
];

export const zone1895 = {
  id: "zone-1895",
  name: "1895 片区示意范围",
  positions: [
    [120.8545, 32.0479],
    [120.8568, 32.0476],
    [120.8572, 32.0495],
    [120.8548, 32.0498],
  ],
  summary: "用于演示专题图层中的面状要素与透明度样式，实际系统应接入测绘或规划数据。",
};

export const eraFilterOptions = ["全部", ...new Set(heritageSites.map((s) => s.era))];
