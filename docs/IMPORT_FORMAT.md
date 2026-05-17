# Rate Import Format —字段说明

> 本文件说明批量导入（Excel / CSV）的字段规范。
> 可在后台 **Import Rates** 弹窗中点击「⬇ Download Template」下载模板文件。

---

## 列定义

| 列名（CSV表头） | 中文名 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `type` | 运输类型 | `air` / `ocean` | ✅ | 默认 `air`。`air` = 空运，`ocean` = 海运 |
| `origin` | 出发地 | 文本 | ✅ | 3位IATA/港口代码，如 `SHA`、`PEK`、`SZX`（会自动转大写） |
| `destination` | 目的地 | 文本 | ✅ | 3位IATA/港口代码，如 `LAX`、`FRA`、`SGN` |
| `carrier` | 承运人 | 文本 | 选填 | 航司/船公司代码，如 `CX`、`CA`、`COSCO`（会自动转大写） |
| `commodity` | 货物类型 | 文本 | 选填 | 如 `General Cargo`、`FCL`、`LCL` |
| `currency` | 币种 | `CNY`/`USD`/`EUR`/`HKD` | 选填 | 默认 `CNY` |
| `unit` | 计费单位 | `teu`/`cbm`/`kg`/`shipment` | 选填 | 仅 `ocean` 有意义，默认 `teu`；`air` 固定为 `kg` |
| `rate_min` | 最低收费 | 数字 | 选填\* | 仅 `air` 有效，最低收费金额（CNY） |
| `rate_neg45` | ≤45kg 单价 | 数字 | 选填\* | 仅 `air` 有效，≤45kg 每公斤单价（CNY） |
| `rate_pos45` | >45kg 单价 | 数字 | 选填\* | 仅 `air` 有效，>45kg 每公斤单价（CNY） |
| `rate_pos100` | >100kg 单价 | 数字 | 选填\* | 仅 `air` 有效，>100kg 每公斤单价（CNY） |
| `rate_pos300` | >300kg 单价 | 数字 | 选填\* | 仅 `air` 有效，>300kg 每公斤单价（CNY） |
| `rate_pos500` | >500kg 单价 | 数字 | 选填\* | 仅 `air` 有效，>500kg 每公斤单价（CNY） |
| `rate_pos1000` | >1000kg 单价 | 数字 | 选填\* | 仅 `air` 有效，>1000kg 每公斤单价（CNY） |
| `mincharge` | 最低收费 | 数字 | 选填 | 通用最低收费金额（air 和 ocean 均适用） |
| `validfrom` | 有效期起 | YYYY-MM-DD | 选填 | 如 `2026-06-01`，留空则无限制 |
| `validto` | 有效期止 | YYYY-MM-DD | 选填 | 如 `2026-06-30`，留空则无限制 |
| `remark` | 备注 | 文本 | 选填 | 自由文本，如 `Peak season surcharge included` |

> **\* 至少填写一个 `air` 价格列**
>
> 对于 `type=air` 的行，至少需要在 `rate_min`、`rate_neg45`、`rate_pos45`、`rate_pos100`、`rate_pos300`、`rate_pos500`、`rate_pos1000` 中填入一个数值，否则该行会被标记为错误并跳过。
>
> 对于 `type=ocean` 的行，只要有 `origin` + `destination` 即可导入（`mincharge` 选填）。

---

## 字符限制

| 字段 | 最大长度 | 特殊要求 |
|---|---|---|
| `type` | 10 | 仅允许 `air` 或 `ocean`（不区分大小写） |
| `origin` | 10 | 建议 3 位代码 |
| `destination` | 10 | 建议 3 位代码 |
| `carrier` | 20 | 英文字母 |
| `commodity` | 50 | 任意文本 |
| `currency` | 5 | 必须是 CNY / USD / EUR / HKD |
| `unit` | 20 | teu / cbm / kg / shipment |
| `rate_*` / `mincharge` | — | 正数，允许小数，最多2位 |
| `validfrom` / `validto` | 10 | 格式必须是 `YYYY-MM-DD`（如 `2026-06-01`） |
| `remark` | 500 | 任意文本 |

---

## 示例数据

### 空运（Air）

```csv
type,origin,destination,carrier,commodity,currency,unit,rate_min,rate_neg45,rate_pos45,rate_pos100,rate_pos300,rate_pos500,rate_pos1000,mincharge,validfrom,validto,remark
air,SHA,LAX,CX,General Cargo,CNY,kg,120,4.50,3.80,3.20,2.80,2.50,2.20,120,2026-06-01,2026-06-30,
air,PEK,FRA,LH,Electronics,CNY,kg,150,5.20,4.50,3.80,3.20,2.90,2.60,,2026-06-01,2026-06-30,
```

### 海运（Ocean）

```csv
type,origin,destination,carrier,commodity,currency,unit,rate_min,rate_neg45,rate_pos45,rate_pos100,rate_pos300,rate_pos500,rate_pos1000,mincharge,validfrom,validto,remark
ocean,SHA,USLAX,COSCO,FCL,USD,teu,,,,,,,1200,2026-06-01,2026-06-30,Peak season
ocean,SZX,SGSL,MSK,LCL,USD,cbm,,,,,,,350,2026-06-01,2026-06-30,
```

---

## 注意事项

1. **不要填写 `rate` 列**：`rate` 列（旧的单一价格列）已废弃，导入时请勿填写，否则会被忽略。
2. **不要填写 `density_ratio` 列**：`density_ratio` 列已废弃，导入时请勿填写。
3. **日期格式**：必须是 `YYYY-MM-DD`，如 `2026-06-01`。不接受 `2026/06/01` 或 `01-Jun-2026`。
4. **数字格式**：数字中不应包含货币符号（如 `¥`、`$`）或千分位逗号（如 `1,234.56`）。直接写 `1234.56`。
5. **重复数据**：导入时会以 `id`（UUID）去重，新行直接追加。如需更新已有数据，请先在后台删除旧行再导入。
6. **Operator 自动记录**：每条导入记录会自动附加当前登录账号名到 `operator` 字段，可在 Logs 中查看。

---

*最后更新：2026-05-17*
