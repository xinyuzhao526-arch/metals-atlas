from dataclasses import dataclass


COUNTRY_REFERENCE_VERSION = "2026-09-17.v1"

COUNTRY_REGIONS = frozenset(
    {
        "Africa",
        "Asia",
        "Europe",
        "North America",
        "Oceania",
        "South America",
    }
)


@dataclass(frozen=True)
class CountryReference:
    iso2: str
    iso3: str
    name_en: str
    name_zh: str
    region: str


# Phase 1A controlled country dictionary. Keep entries sorted by ISO3 and update the
# version whenever this reference set changes.
COUNTRIES: tuple[CountryReference, ...] = (
    CountryReference("AU", "AUS", "Australia", "澳大利亚", "Oceania"),
    CountryReference("BR", "BRA", "Brazil", "巴西", "South America"),
    CountryReference("BW", "BWA", "Botswana", "博茨瓦纳", "Africa"),
    CountryReference("CA", "CAN", "Canada", "加拿大", "North America"),
    CountryReference("CL", "CHL", "Chile", "智利", "South America"),
    CountryReference("CN", "CHN", "China", "中国", "Asia"),
    CountryReference("CD", "COD", "Democratic Republic of the Congo", "刚果民主共和国", "Africa"),
    CountryReference("EC", "ECU", "Ecuador", "厄瓜多尔", "South America"),
    CountryReference("ID", "IDN", "Indonesia", "印度尼西亚", "Asia"),
    CountryReference("MX", "MEX", "Mexico", "墨西哥", "North America"),
    CountryReference("MN", "MNG", "Mongolia", "蒙古", "Asia"),
    CountryReference("PA", "PAN", "Panama", "巴拿马", "North America"),
    CountryReference("PE", "PER", "Peru", "秘鲁", "South America"),
    CountryReference("RU", "RUS", "Russian Federation", "俄罗斯", "Europe"),
    CountryReference("RS", "SRB", "Serbia", "塞尔维亚", "Europe"),
    CountryReference("US", "USA", "United States", "美国", "North America"),
    CountryReference("ZM", "ZMB", "Zambia", "赞比亚", "Africa"),
)


def validate_country_reference() -> None:
    iso2_codes = [country.iso2 for country in COUNTRIES]
    iso3_codes = [country.iso3 for country in COUNTRIES]
    if len(iso2_codes) != len(set(iso2_codes)):
        raise RuntimeError("国家参考数据包含重复 ISO2")
    if len(iso3_codes) != len(set(iso3_codes)):
        raise RuntimeError("国家参考数据包含重复 ISO3")
    for country in COUNTRIES:
        if len(country.iso2) != 2 or country.iso2 != country.iso2.upper():
            raise RuntimeError(f"国家参考数据 ISO2 非法: {country.iso2}")
        if len(country.iso3) != 3 or country.iso3 != country.iso3.upper():
            raise RuntimeError(f"国家参考数据 ISO3 非法: {country.iso3}")
        if country.region not in COUNTRY_REGIONS:
            raise RuntimeError(f"国家参考数据 region 非法: {country.iso3}={country.region}")


validate_country_reference()
