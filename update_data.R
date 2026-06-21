# This script updates an app that tracks various Canadian ETFs

# To start RStudio server: servr::httd()
# To stop the server: servr::daemon_stop(1)

## LIBRARIES ####

library(tidyverse)
library(tidyquant)
library(jsonlite)
library(slider)
library(zoo)

## BASIC SETTINGS ####

# Select the target tickers

etf_tickers <- c("XFN.TO", 
                 "XEG.TO", 
                 "XMA.TO", 
                 "XIT.TO", 
                 "XRE.TO", 
                 "XUT.TO",
                 "VCN.TO")

# Set the start date for ETF data and the charts

start_date <- Sys.Date() - 2000

chart_start_date <- floor_date(Sys.Date() - days(1820), "month")

## GET AND CLEAN DATA ####

# ETF prices

raw_prices_etfs <- tq_get(etf_tickers, 
                            get = "stock.prices", 
                            from = start_date)

print(paste("There are", sum(is.na(raw_prices_etfs)), "NAs in the raw_prices_etfs data"))

prices_wide_etfs <- raw_prices_etfs |>
        select(date, symbol, adjusted) |>
        mutate(symbol = str_remove(symbol, "\\.TO")) |>
        pivot_wider(names_from = symbol, values_from = adjusted) |>
        arrange(date) |>
        mutate(across(-date, ~ zoo::na.approx(.x, na.rm = FALSE))) |>
        fill(everything(), .direction = "downup") |>
        filter(date < Sys.Date())

log_prices_etfs <- prices_wide_etfs |>
        mutate(across(-date, log))

missing_data_check <- raw_prices_etfs |>
        arrange(desc(date)) |>
        select(adjusted) |>
        head(50) |>
        summarise(na = sum(is.na(adjusted)))

# Daily returns (log)

returns_wide <- log_prices_etfs |>
        mutate(across(-date, ~ .x - lag(.x))) |>
        drop_na()

# Dividends

safe_tq_get <- possibly(tq_get, otherwise = tibble())

dividend_summary <- map_dfr(etf_tickers, function(ticker) {
        
        df <- safe_tq_get(ticker, 
                          get = "dividends")
        
        if (is.null(df) || nrow(df) == 0) {
                
                return(tibble(symbol = ticker,
                              dividend_amount = 0,
                              dividend_frequency = "None",
                              annual_dividend = 0))
                
        }
        
        df <- df |>
                filter(date >= Sys.Date() - 364) |>
                summarise(dividend_count = n(),
                          dividend_amount = round(sum(value), 2)) |>
                mutate(symbol = ticker,
                       .before = dividend_count) |>
                mutate(symbol = str_remove(symbol, "\\.TO")) 
        
        return(df)
        
})

latest_prices <- prices_wide_etfs |>
        tail(1) |>
        select(-date) |>
        pivot_longer(cols = everything(), 
                     names_to = "symbol", 
                     values_to = "current_price")

dividend_data <- dividend_summary |>
        left_join(latest_prices, by = "symbol") |>
        mutate(yield_pct = if_else(current_price > 0, 
                                   round((dividend_amount / current_price) * 100, 2), 
                                   0)) |>
        mutate(frequency = case_when(dividend_count == 12 ~ "MONTHLY",
                                     dividend_count == 4 ~ "QUARTERLY",
                                     TRUE ~ "NONE"),
               .before = dividend_amount) |>
        arrange(desc(yield_pct))

## ROLLING 50D AVERAGES

prices_with_ma <- raw_prices_etfs |>
        select(date, symbol, adjusted) |>
        mutate(symbol = str_remove(symbol, "\\.TO")) |>
        group_by(symbol) |>
        arrange(date) |>
        mutate(ma_50 = round(rollmean(adjusted, k = 50, fill = NA, align = "right"), 2)) |>
        ungroup() |>
        rename(price = adjusted) |>
        mutate(price = round(price, 2)) |>
        filter(date >= chart_start_date)

prices_indexed <- raw_prices_etfs |>
        select(date, symbol, adjusted) |>
        mutate(symbol = str_remove(symbol, "\\.TO")) |>
        group_by(symbol) |>
        arrange(date) |>
        mutate(ma_50 = zoo::rollmean(adjusted, k = 50, fill = NA, align = "right")) |>
        filter(date >= chart_start_date) |>
        mutate(base_price = first(adjusted),
               price_indexed = round((adjusted / base_price) * 100, 2),
               ma_50_indexed = round((ma_50 / base_price) * 100, 2)) |>
        ungroup() |>
        select(date, symbol, price_indexed, ma_50_indexed)







## SAVE DATA ####

write_json(dividend_data, 
           "data/dividend_data.json", 
           pretty = TRUE)

write_json(prices_with_ma,
           "data/prices_with_ma.json",
           pretty = TRUE)

write_json(prices_indexed,
           "data/prices_indexed.json",
           pretty = TRUE)


